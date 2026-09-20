import { Product, Language } from '../types';

export function updatePageSEO(options: {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  product?: Product;
  breadcrumbs?: { name: string; url: string }[];
  language?: Language;
}) {
  const {
    title,
    description = 'MarketSpace is a modern marketplace offering products, meals, services, dropshipping, and deals with fast delivery.',
    image = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80',
    url = typeof window !== 'undefined' ? window.location.href : 'https://marketspace.example.com',
    type = 'website',
    product,
    breadcrumbs,
    language = 'ar',
  } = options;

  if (typeof document === 'undefined') return;

  // Title
  document.title = title ? `${title} | MarketSpace` : 'MarketSpace - Smart Marketplace';

  // Description
  setMetaTag('name', 'description', description);
  setMetaTag('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large');

  // Open Graph
  setMetaTag('property', 'og:site_name', 'MarketSpace');
  setMetaTag('property', 'og:title', title);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:image', image);
  setMetaTag('property', 'og:url', url);
  setMetaTag('property', 'og:type', type);
  setMetaTag('property', 'og:locale', language === 'ar' ? 'ar_AR' : language === 'so' ? 'so_SO' : 'en_US');

  // Twitter Cards
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', title);
  setMetaTag('name', 'twitter:description', description);
  setMetaTag('name', 'twitter:image', image);

  // Canonical Link
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url.split('#')[0].split('?')[0];

  // Inject Schemas
  injectStructuredData(product, breadcrumbs, language);
}

function setMetaTag(attrName: 'name' | 'property', attrValue: string, content: string) {
  let meta = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attrName, attrValue);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function injectStructuredData(
  product?: Product,
  breadcrumbs?: { name: string; url: string }[],
  language: Language = 'ar'
) {
  // Remove prior schema script tags
  document.querySelectorAll('script[data-marketspace-schema]').forEach(el => el.remove());

  const schemas: object[] = [
    // Organization Schema
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'MarketSpace',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://marketspace.example.com',
      logo: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80',
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: '+252612494952',
        contactType: 'customer service',
        email: 'marketspace119@gmail.com',
        areaServed: ['SO', 'Global'],
        availableLanguage: ['Arabic', 'English', 'Somali'],
      },
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Taleh district',
        addressLocality: 'Mogadishu',
        addressCountry: 'Somalia',
      },
    },
    // WebSite Schema
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'MarketSpace',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://marketspace.example.com',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${typeof window !== 'undefined' ? window.location.origin : ''}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  // Breadcrumbs Schema
  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    });
  }

  // Product Schema
  if (product) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': product.type === 'restaurant-products' ? 'MenuItem' : 'Product',
      name: product.title[language] || product.title.en,
      image: product.images,
      description: product.description[language] || product.description.en,
      sku: product.id,
      brand: {
        '@type': 'Brand',
        name: product.brand || product.seller?.name || 'MarketSpace',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: product.currency,
        price: product.price,
        availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: typeof window !== 'undefined' ? window.location.href : '',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating,
        reviewCount: product.reviewsCount,
      },
    });
  }

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-marketspace-schema', 'true');
  script.textContent = JSON.stringify(schemas);
  document.head.appendChild(script);
}
