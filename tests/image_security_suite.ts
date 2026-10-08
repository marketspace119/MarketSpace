process.env.NODE_ENV = 'test';
process.env.ENABLE_TEST_TOKENS = 'true';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

import assert from 'assert';
import { sniffImageMagicBytes } from '../src/lib/imageSecurity';
import { processImageVerificationGateway } from '../server/imageGateway';
import { getAdminDb, setAdminDbForTesting } from '../server/firebaseAdmin';

interface TestResult {
  id: string;
  name: string;
  expectedResult: 'VALID' | 'REJECTED';
  actualResult: 'VALID' | 'REJECTED';
  pass: boolean;
  reason?: string;
}

const results: TestResult[] = [];

function record(t: TestResult) {
  results.push(t);
  const tag = t.pass ? '[PASS]' : '[FAIL]';
  console.log(`${tag} ${t.id}: ${t.name} -> Expected: ${t.expectedResult}, Actual: ${t.actualResult} (${t.reason || 'OK'})`);
}

function createMockAuthHeader(uid: string): string {
  const payload = {
    uid,
    sub: uid,
    email: `${uid}@marketspace.test`,
    email_verified: true,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `Bearer test-token:${b64}`;
}

export async function runImageSecuritySuite() {
  console.log('================================================================');
  console.log('RUNNING AUTHORITATIVE IMAGE CONTENT SECURITY REGRESSION SUITE');
  console.log('Deep Magic-Byte Verification, Header Sniffing, and Anti-Spoofing');
  console.log('================================================================\n');

  const authHeader = createMockAuthHeader('test_seller_user');

  const docs = new Map<string, any>();
  docs.set('test_seller_user', {
    id: 'test_seller_user',
    email: 'test_seller_user@marketspace.test',
    role: 'SELLER',
    status: 'active',
    isVerified: true,
  });
  setAdminDbForTesting({
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: docs.has(id),
          data: () => docs.get(id),
        }),
        set: async (data: any) => { docs.set(id, data); },
      }),
    }),
  });

  // Vector 1: Valid PNG (PNG 8-byte magic: 89 50 4E 47 0D 0A 1A 0A + dummy chunk)
  {
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    ]);
    const res = sniffImageMagicBytes(validPngBytes);
    const pass = res.isValid === true && res.detectedFormat === 'png';
    record({
      id: 'IMG-01',
      name: 'Valid PNG Magic Bytes Detection',
      expectedResult: 'VALID',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.byteSignature,
    });
  }

  // Vector 2: Valid JPEG (FF D8 FF E0 + JFIF header)
  {
    const validJpegBytes = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    ]);
    const res = sniffImageMagicBytes(validJpegBytes);
    const pass = res.isValid === true && res.detectedFormat === 'jpeg';
    record({
      id: 'IMG-02',
      name: 'Valid JPEG Magic Bytes Detection',
      expectedResult: 'VALID',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.byteSignature,
    });
  }

  // Vector 3: Valid WebP (52 49 46 46 [RIFF] + len + 57 45 42 50 [WEBP])
  {
    const validWebpBytes = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]);
    const res = sniffImageMagicBytes(validWebpBytes);
    const pass = res.isValid === true && res.detectedFormat === 'webp';
    record({
      id: 'IMG-03',
      name: 'Valid WebP Magic Bytes Detection',
      expectedResult: 'VALID',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.byteSignature,
    });
  }

  // Vector 4: Fake PNG containing HTML / Script Payload (<script>alert(1)</script>)
  {
    const fakePngWithHtml = Buffer.from('<!DOCTYPE html><html><body><script>alert("XSS")</script></body></html>');
    const res = sniffImageMagicBytes(fakePngWithHtml);
    const pass = res.isValid === false && (res.error?.includes('HTML') || res.error?.includes('script') || !res.isValid);
    record({
      id: 'IMG-04',
      name: 'Fake PNG Containing HTML/Script Rejection',
      expectedResult: 'REJECTED',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.error,
    });
  }

  // Vector 5: Renamed Executable (Windows MZ PE binary starting with 4D 5A)
  {
    const mzExeBytes = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF]);
    const res = sniffImageMagicBytes(mzExeBytes);
    const pass = res.isValid === false && res.error?.includes('Executable');
    record({
      id: 'IMG-05',
      name: 'Disguised Windows/DOS Executable (MZ) Rejection',
      expectedResult: 'REJECTED',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.error,
    });
  }

  // Vector 5b: Renamed Linux ELF Binary (7F 45 4C 46)
  {
    const elfBytes = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const res = sniffImageMagicBytes(elfBytes);
    const pass = res.isValid === false && res.error?.includes('ELF');
    record({
      id: 'IMG-05b',
      name: 'Disguised Linux Executable (ELF) Rejection',
      expectedResult: 'REJECTED',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.error,
    });
  }

  // Vector 6: SVG Vector Graphics Rejection (Anti-XSS rule)
  {
    const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>');
    const res = sniffImageMagicBytes(svgBytes);
    const pass = res.isValid === false && (res.error?.includes('SVG') || res.error?.includes('prohibited'));
    record({
      id: 'IMG-06',
      name: 'SVG Graphic & Vector XSS Rejection',
      expectedResult: 'REJECTED',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.error,
    });
  }

  // Vector 7: Oversized File (> 5MB)
  {
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 0xFF);
    const res = sniffImageMagicBytes(oversizedBuffer);
    const pass = res.isValid === false && res.error?.includes('exceeds 5MB');
    record({
      id: 'IMG-07',
      name: 'Oversized File (>5MB) Rejection',
      expectedResult: 'REJECTED',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.error,
    });
  }

  // Vector 8: Corrupt / Malformed Image Header
  {
    const malformedBytes = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, 0x11, 0x22, 0x33, 0x44]);
    const res = sniffImageMagicBytes(malformedBytes);
    const pass = res.isValid === false && res.error?.includes('Unrecognized');
    record({
      id: 'IMG-08',
      name: 'Malformed / Unrecognized Binary Header Rejection',
      expectedResult: 'REJECTED',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.error,
    });
  }

  // Vector 9: Authoritative Server Gateway End-to-End Verification
  {
    let pass = false;
    let details = '';
    try {
      const validPngBase64 = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      ]).toString('base64');

      const serverRes = await processImageVerificationGateway(
        {
          data: `data:image/png;base64,${validPngBase64}`,
          filename: 'safe_test.png',
          declaredMimeType: 'image/png',
        },
        authHeader
      );

      pass = serverRes.isValid === true && serverRes.detectedFormat === 'png';
      details = `Gateway verified PNG, byteLength=${serverRes.byteLength}`;
    } catch (err: any) {
      details = err.message;
    }

    record({
      id: 'IMG-09',
      name: 'Server Image Gateway End-to-End Verification',
      expectedResult: 'VALID',
      actualResult: pass ? 'VALID' : 'REJECTED',
      pass,
      reason: details,
    });
  }

  // Vector 10: MIME Spoofing Rejection by Server Gateway (Declared JPEG but binary is PNG)
  {
    let blocked = false;
    let details = '';
    try {
      const validPngBase64 = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      ]).toString('base64');

      await processImageVerificationGateway(
        {
          data: `data:image/jpeg;base64,${validPngBase64}`,
          filename: 'spoofed.jpg',
          declaredMimeType: 'image/jpeg',
        },
        authHeader
      );
      details = 'Breach: Server accepted spoofed MIME';
    } catch (err: any) {
      blocked = true;
      details = `Correctly rejected: ${err.message}`;
    }

    record({
      id: 'IMG-10',
      name: 'Server Image Gateway MIME Type Spoofing Rejection',
      expectedResult: 'REJECTED',
      actualResult: blocked ? 'REJECTED' : 'VALID',
      pass: blocked,
      reason: details,
    });
  }

  // Vector 11: Valid GIF89a Magic Bytes Detection
  {
    const validGifBytes = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
      0x01, 0x00, 0x80, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
    ]);
    const res = sniffImageMagicBytes(validGifBytes);
    const pass = res.isValid === true && res.detectedFormat === 'gif';
    record({
      id: 'IMG-11',
      name: 'Valid GIF89a Magic Bytes Detection',
      expectedResult: 'VALID',
      actualResult: res.isValid ? 'VALID' : 'REJECTED',
      pass,
      reason: res.byteSignature,
    });
  }

  // Vector 12: Deep-Offset Polyglot JPEG Payloads at >256B, 1KB, 4KB, 16KB, 32KB, and 60KB
  {
    const offsets = [300, 1024, 4096, 16384, 32768, 61440];
    let allRejected = true;
    let failureReason = 'All deep-offset polyglots (300B to 60KB) rejected';
    for (const offset of offsets) {
      const buf = Buffer.alloc(64 * 1024, 0x00);
      // Valid JPEG header
      buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF; buf[3] = 0xE0;
      const payload = Buffer.from('<?php system($_GET["cmd"]); ?>');
      payload.copy(buf, offset);
      const res = sniffImageMagicBytes(buf);
      if (res.isValid) {
        allRejected = false;
        failureReason = `Failed to reject PHP polyglot at offset ${offset}`;
        break;
      }
    }
    record({
      id: 'IMG-12',
      name: 'Deep-Offset Polyglot JPEG + PHP Rejection (300B, 1KB, 4KB, 16KB, 32KB, 60KB)',
      expectedResult: 'REJECTED',
      actualResult: allRejected ? 'REJECTED' : 'VALID',
      pass: allRejected,
      reason: failureReason,
    });
  }

  // Vector 13: Embedded iframe, object, embed, onerror, onload, and javascript: Polyglot Rejection
  {
    const vectors = [
      '<iframe src="https://evil.test"></iframe>',
      '<object data="evil.swf"></object>',
      '<embed src="evil.swf">',
      'onerror=alert(1)',
      'onload=alert(1)',
      'javascript:alert(1)',
    ];
    let allBlocked = true;
    let reason = 'All 6 HTML/JS polyglot vectors (<iframe, <object, <embed, onerror=, onload=, javascript:) rejected';
    for (const v of vectors) {
      const buf = Buffer.alloc(2048, 0x20);
      buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4E; buf[3] = 0x47;
      buf[4] = 0x0D; buf[5] = 0x0A; buf[6] = 0x1A; buf[7] = 0x0A;
      Buffer.from(v).copy(buf, 512);
      const res = sniffImageMagicBytes(buf);
      if (res.isValid) {
        allBlocked = false;
        reason = `Vector was not blocked: ${v}`;
        break;
      }
    }
    record({
      id: 'IMG-13',
      name: 'Polyglot PNG + iframe/object/embed/onerror/onload/javascript Rejection',
      expectedResult: 'REJECTED',
      actualResult: allBlocked ? 'REJECTED' : 'VALID',
      pass: allBlocked,
      reason,
    });
  }

  console.log('\n================================================================');
  console.log('IMAGE SECURITY TEST SUITE RESULTS:');
  console.log(`TOTAL TESTS: ${results.length}`);
  console.log(`PASSED: ${results.filter(r => r.pass).length}`);
  console.log(`FAILED: ${results.filter(r => !r.pass).length}`);
  console.log('================================================================\n');

  const allPassed = results.every(r => r.pass);
  assert(allPassed, 'All Image Security tests must PASS');
}

if (process.argv[1]?.endsWith('image_security_suite.ts')) {
  runImageSecuritySuite().catch(err => {
    console.error('Image security suite failed:', err);
    process.exit(1);
  });
}
