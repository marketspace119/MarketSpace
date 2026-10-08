import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, cleanForFirestore } from '../lib/firebase';
import { Conversation, ChatMessage, UserRole } from '../types';
import { notificationService } from './notificationService';

const CONVERSATIONS_STORAGE_KEY = 'marketspace_conversations_v1';
const MESSAGES_STORAGE_KEY = 'marketspace_messages_v1';

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_COLLECTION = 'messages';

let memoryConversations: Conversation[] = [];
let memoryMessages: Record<string, ChatMessage[]> = {};

function isProductionEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return true;
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) return true;
  return false;
}

async function persistMessagingDocToFirestore(
  collectionName: string,
  docId: string,
  payload: Record<string, any>,
  merge = false
): Promise<void> {
  const cleanPayload = cleanForFirestore(payload);
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    await setDoc(doc(db, collectionName, docId), cleanPayload, merge ? { merge: true } : {});
  } else {
    const serverAdminModule = '../../server/firebaseAdmin';
    const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error(`Database write failure (Fail-Closed): Firestore Admin DB unavailable for ${collectionName}/${docId}`);
    }
    await adminDb.collection(collectionName).doc(docId).set(cleanPayload, merge ? { merge: true } : {});
  }
}

function loadConversations(): Conversation[] {
  if (memoryConversations.length > 0) return memoryConversations;
  // F-20: Do not read or trust localStorage for conversation authority
  return memoryConversations;
}

function persistConversations(items: Conversation[]) {
  memoryConversations = items;
  // F-20: LocalStorage persistence removed for authoritative conversation state
}

function loadMessages(conversationId: string): ChatMessage[] {
  if (memoryMessages[conversationId]) return memoryMessages[conversationId];
  // F-20: Do not read or trust localStorage for message authority
  return [];
}

function persistMessages(conversationId: string, messages: ChatMessage[]) {
  memoryMessages[conversationId] = messages;
  // F-20: LocalStorage persistence removed for authoritative message state
}

export const messagingService = {
  resetMemoryState(): void {
    memoryConversations = [];
    memoryMessages = {};
  },

  getMessages(conversationId: string): ChatMessage[] {
    return loadMessages(conversationId);
  },

  /**
   * Real-time subscription to user conversations
   */
  subscribeToConversations(
    userId: string,
    onUpdate: (conversations: Conversation[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!userId) {
      onUpdate([]);
      return () => {};
    }

    // Strict identity validation: Ensure Firebase Auth state matches supplied userId before attaching listener
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid !== userId) {
      return () => {};
    }

    try {
      const q = query(
        collection(db, CONVERSATIONS_COLLECTION),
        where('participantIds', 'array-contains', userId),
        limit(200)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const cloud: Conversation[] = [];
          snapshot.forEach(docSnap => {
            cloud.push(docSnap.data() as Conversation);
          });
          const sorted = cloud.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );

          // Update local cache
          const current = loadConversations().filter(
            c => !c.participantIds.includes(userId)
          );
          persistConversations([...current, ...sorted]);
          onUpdate(sorted);
        },
        error => {
          console.error('[MessagingService:Error] Conversations subscription failed for user:', userId, error);
          if (onError) onError(error);
          // F-19: In production, NEVER fall back to stale local cache on snapshot failure
          if (isProductionEnvironment() || (error as any).code === 'permission-denied') {
            return;
          }
          const local = loadConversations().filter(c => c.participantIds.includes(userId));
          onUpdate(local.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        }
      );

      return unsubscribe;
    } catch (err: any) {
      console.error('[MessagingService:Error] Conversations subscription setup error:', err);
      if (onError) onError(err);
      if (isProductionEnvironment() || err?.code === 'permission-denied') {
        return () => {};
      }
      const local = loadConversations().filter(c => c.participantIds.includes(userId));
      onUpdate(local);
      return () => {};
    }
  },

  /**
   * Real-time subscription to messages in a conversation
   */
  subscribeToMessages(
    conversationId: string,
    onUpdate: (messages: ChatMessage[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!conversationId) {
      onUpdate([]);
      return () => {};
    }

    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      return () => {};
    }

    try {
      const q = query(
        collection(db, MESSAGES_COLLECTION),
        where('conversationId', '==', conversationId),
        limit(200)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const cloud: ChatMessage[] = [];
          snapshot.forEach(docSnap => {
            cloud.push(docSnap.data() as ChatMessage);
          });
          const sorted = cloud.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          persistMessages(conversationId, sorted);
          onUpdate(sorted);
        },
        error => {
          console.error('[MessagingService:Error] Messages query failed for conversation:', conversationId, error);
          if (onError) onError(error);
          // F-19: In production, NEVER fall back to stale local cache on snapshot failure
          if (isProductionEnvironment() || (error as any).code === 'permission-denied') {
            return;
          }
          const local = loadMessages(conversationId);
          onUpdate(local.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        }
      );

      return unsubscribe;
    } catch (err: any) {
      console.error('[MessagingService:Error] Messages subscription setup error:', err);
      if (onError) onError(err);
      if (isProductionEnvironment() || err?.code === 'permission-denied') {
        return () => {};
      }
      const local = loadMessages(conversationId);
      onUpdate(local);
      return () => {};
    }
  },

  /**
   * Find or Create a Conversation
   */
  async getOrCreateConversation(params: {
    participantIds: string[];
    participantDetails?: {
      id: string;
      name: string;
      role: UserRole;
      avatar?: string;
    }[];
    participants?: Record<string, any>;
    contextType: 'order' | 'booking' | 'product' | 'store' | 'general' | 'support';
    contextId?: string;
    contextTitle?: string;
    callerId?: string;
  }): Promise<Conversation> {
    // V3-06 & F-16 Remediation: Require legitimate context linking and 2-10 participants
    if (!['order', 'booking', 'product', 'store', 'general', 'support'].includes(params.contextType)) {
      throw new Error('Invalid conversation context type');
    }
    if ((params.contextType === 'order' || params.contextType === 'booking' || params.contextType === 'product' || params.contextType === 'store') && !params.contextId) {
      throw new Error(`Context ID is strictly required for ${params.contextType} conversations`);
    }

    const sortedIds = Array.from(new Set(params.participantIds.filter(Boolean))).sort();
    if (sortedIds.length < 2 || sortedIds.length > 10) {
      throw new Error('Invalid conversation participants: must have between 2 and 10 unique participants');
    }

    const effectiveCallerId = auth.currentUser?.uid || params.callerId;
    if (effectiveCallerId && !sortedIds.includes(effectiveCallerId)) {
      throw new Error('Unauthorized: Authenticated caller must be a participant in the conversation');
    }

    // F-16: Verify context entity ownership and participant binding
    if (params.contextType === 'order' && params.contextId) {
      let orderDoc: any = null;
      if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const snap = await getAdminDb().collection('orders').doc(params.contextId).get();
        if (snap.exists) orderDoc = snap.data();
      }
      if (!orderDoc) {
        const { orderService } = await import('./orderService');
        orderDoc = orderService.getOrderById(params.contextId);
      }
      if (!orderDoc) {
        throw new Error(`Order "${params.contextId}" not found for conversation context`);
      }
      const orderSellerIds: string[] = Array.isArray(orderDoc.sellerIds)
        ? orderDoc.sellerIds
        : Array.isArray(orderDoc.vendorOrders)
        ? orderDoc.vendorOrders.map((v: any) => v.sellerId).filter(Boolean)
        : [];
      if (effectiveCallerId && orderDoc.customerId !== effectiveCallerId && !orderSellerIds.includes(effectiveCallerId)) {
        throw new Error('Unauthorized: Caller is not the customer or seller of the referenced order');
      }
      if (!sortedIds.includes(orderDoc.customerId) || (orderSellerIds.length > 0 && !sortedIds.some(id => orderSellerIds.includes(id)))) {
        throw new Error('Invalid participants: Order conversation must include the order customer and seller');
      }
    } else if (params.contextType === 'booking' && params.contextId) {
      let bookingDoc: any = null;
      if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const snap = await getAdminDb().collection('bookings').doc(params.contextId).get();
        if (snap.exists) bookingDoc = snap.data();
      }
      if (!bookingDoc) {
        const { bookingService } = await import('./bookingService');
        bookingDoc = bookingService.getBookingById(params.contextId);
      }
      if (!bookingDoc) {
        throw new Error(`Booking "${params.contextId}" not found for conversation context`);
      }
      const providerId = bookingDoc.sellerId || bookingDoc.providerId;
      if (effectiveCallerId && bookingDoc.customerId !== effectiveCallerId && providerId !== effectiveCallerId) {
        throw new Error('Unauthorized: Caller is not a participant in the referenced booking');
      }
      if (!sortedIds.includes(bookingDoc.customerId) || (providerId && !sortedIds.includes(providerId))) {
        throw new Error('Invalid participants: Booking conversation must include the booking customer and provider');
      }
    } else if (params.contextType === 'store' && params.contextId) {
      const { storeService } = await import('./storeService');
      let storeDoc: any = storeService.getStoreById(params.contextId);
      if (!storeDoc && (typeof window === 'undefined' || process.env.NODE_ENV === 'test')) {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const snap = await getAdminDb().collection('stores').doc(params.contextId).get();
        if (snap.exists) storeDoc = snap.data();
      }
      if (!storeDoc || !sortedIds.includes(storeDoc.sellerId)) {
        throw new Error('Invalid store conversation: Referenced store owner must be a participant');
      }
    } else if (params.contextType === 'product' && params.contextId) {
      const { productService } = await import('./productService');
      let prodDoc: any = productService.getProductById(params.contextId);
      if (!prodDoc && (typeof window === 'undefined' || process.env.NODE_ENV === 'test')) {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const snap = await getAdminDb().collection('products').doc(params.contextId).get();
        if (snap.exists) prodDoc = snap.data();
      }
      if (!prodDoc || !sortedIds.includes(prodDoc.sellerId)) {
        throw new Error('Invalid product conversation: Referenced product seller must be a participant');
      }
    }

    const list = loadConversations();

    // Check existing
    const existing = list.find(c => {
      const cSorted = [...c.participantIds].sort();
      const sameParticipants =
        cSorted.length === sortedIds.length &&
        cSorted.every((id, idx) => id === sortedIds[idx]);
      if (params.contextId) {
        return sameParticipants && c.contextId === params.contextId;
      }
      return sameParticipants && c.contextType === params.contextType;
    });

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newConv: Conversation = {
      id,
      participantIds: sortedIds,
      participantDetails: params.participantDetails || [],
      contextType: params.contextType,
      contextId: params.contextId,
      contextTitle: params.contextTitle,
      lastMessage: '',
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      unreadCount: {},
    };

    // F-11: Authoritative Cloud Firestore write MUST succeed BEFORE updating local cache (Fail-Closed)
    try {
      await persistMessagingDocToFirestore(CONVERSATIONS_COLLECTION, id, newConv, false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `${CONVERSATIONS_COLLECTION}/${id}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to create conversation in Firestore (${err?.message || err})`);
    }

    list.unshift(newConv);
    persistConversations(list);

    return newConv;
  },

  /**
   * Send a Message
   */
  async sendMessage(params: {
    conversationId: string;
    senderId: string;
    senderName: string;
    senderRole: UserRole;
    text: string;
  }): Promise<ChatMessage> {
    const text = params.text.trim();
    if (!text) {
      throw new Error('Message cannot be empty');
    }
    if (text.length > 2000) {
      throw new Error('Message exceeds 2000 character limit');
    }

    // V3-06 Anti-Spoofing: Ensure caller does not forge identity
    const currentUid = auth.currentUser?.uid;
    if (currentUid && currentUid !== params.senderId) {
      throw new Error('Unauthorized: Sender identity does not match authenticated user');
    }

    const convList = loadConversations();
    const convIndex = convList.findIndex(c => c.id === params.conversationId);
    if (convIndex === -1) throw new Error('Conversation not found');

    const conversation = convList[convIndex];
    if (!conversation.participantIds.includes(params.senderId)) {
      throw new Error('Unauthorized: Sender is not a participant in this conversation');
    }
    const now = new Date().toISOString();
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newMsg: ChatMessage = {
      id: msgId,
      conversationId: params.conversationId,
      senderId: params.senderId,
      senderName: params.senderName,
      senderRole: params.senderRole,
      text,
      createdAt: now,
    };

    // Update conversation state
    const recipientIds = conversation.participantIds.filter(id => id !== params.senderId);
    const unreadCount = { ...(conversation.unreadCount || {}) };
    recipientIds.forEach(rId => {
      unreadCount[rId] = (unreadCount[rId] || 0) + 1;
    });

    const updatedConv: Conversation = {
      ...conversation,
      lastMessage: text,
      lastMessageAt: now,
      lastSenderId: params.senderId,
      unreadCount,
      updatedAt: now,
    };

    // F-11: Authoritative Cloud Firestore write MUST succeed BEFORE updating local state (Fail-Closed)
    try {
      await persistMessagingDocToFirestore(MESSAGES_COLLECTION, msgId, newMsg, false);
      await persistMessagingDocToFirestore(
        CONVERSATIONS_COLLECTION,
        params.conversationId,
        {
          lastMessage: text,
          lastMessageAt: now,
          lastSenderId: params.senderId,
          unreadCount,
          updatedAt: now,
        },
        true
      );
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `${MESSAGES_COLLECTION}/${msgId}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to send message to Firestore (${err?.message || err})`);
    }

    convList[convIndex] = updatedConv;
    persistConversations(convList);

    // Update messages local ONLY after Firestore succeeds
    const localMsgs = loadMessages(params.conversationId);
    localMsgs.push(newMsg);
    persistMessages(params.conversationId, localMsgs);

    // Trigger Notification for recipients
    recipientIds.forEach(rId => {
      notificationService.notifyMessageEvent({
        recipientUserId: rId,
        conversationId: params.conversationId,
        senderName: params.senderName,
        textPreview: text,
      }).catch(err => console.warn('Message notification failed:', err));
    });

    return newMsg;
  },

  /**
   * Mark Conversation as Read (F-11: Firestore-first)
   */
  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    const list = loadConversations();
    const target = list.find(c => c.id === conversationId);
    if (target && target.unreadCount && target.unreadCount[userId]) {
      const nextUnread = { ...target.unreadCount, [userId]: 0 };
      try {
        await persistMessagingDocToFirestore(
          CONVERSATIONS_COLLECTION,
          conversationId,
          { unreadCount: nextUnread, updatedAt: new Date().toISOString() },
          true
        );
      } catch (err: any) {
        handleFirestoreError(err, OperationType.UPDATE, `${CONVERSATIONS_COLLECTION}/${conversationId}`);
        throw new Error(`Database write failure (Fail-Closed): Unable to mark conversation read (${err?.message || err})`);
      }
      target.unreadCount = nextUnread;
      persistConversations(list);
    }
  },

  /**
   * WhatsApp & Phone Link Helpers
   */
  getWhatsAppLink(rawPhone: string, messageText?: string): string {
    const cleanPhone = rawPhone.replace(/[^\d]/g, '');
    const encoded = encodeURIComponent(
      messageText || 'Hello, I am contacting you via MarketSpace regarding my order.'
    );
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  },

  getTelLink(rawPhone: string): string {
    const cleanPhone = rawPhone.replace(/[^\d+]/g, '');
    return `tel:${cleanPhone}`;
  },

  clearUserCache(): void {
    memoryConversations = [];
    memoryMessages = {};
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
        // Clear all conversation message caches (F-23 Remediation)
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith(MESSAGES_STORAGE_KEY) || key.startsWith('marketspace_messages_'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch {
        // ignore
      }
    }
  },
};
