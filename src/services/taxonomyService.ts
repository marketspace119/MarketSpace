import { LocalizedString, MarketplaceType, ProductCondition, Product } from '../types';

export interface TaxonomyCategory {
  id: string;
  slug: string;
  name: LocalizedString;
  icon: string;
  description?: LocalizedString;
  accentColor?: string;
  subcategories?: {
    id: string;
    slug: string;
    name: LocalizedString;
  }[];
}

export interface DomainSection {
  id: MarketplaceType;
  slug: string;
  name: LocalizedString;
  description: LocalizedString;
  icon: string;
  badge?: LocalizedString;
  path: string;
  accentColor: string;
}

/**
 * High-Level MarketSpace Primary Marketplace Domains
 */
export const MARKETPLACE_DOMAINS: DomainSection[] = [
  {
    id: 'shop',
    slug: 'shop',
    name: {
      ar: 'المتجر الإلكتروني',
      en: 'E-Commerce Shop',
      so: 'Dukaanka Ganacsiga',
    },
    description: {
      ar: 'تسوق آلاف المنتجات الجديدة، المستعملة والمستوردة مع ضمان التوصيل السريع',
      en: 'Explore thousands of new, pre-owned, and dropshipped products with fast delivery',
      so: 'Ka baadh kumanaan alaab oo cusub, kuwo la isticmaalay iyo kuwo caalami ah',
    },
    icon: 'ShoppingBag',
    path: '/shop',
    accentColor: '#0E11B7',
  },
  {
    id: 'restaurants',
    slug: 'restaurants',
    name: {
      ar: 'المطاعم والوجبات',
      en: 'Restaurants & Meals',
      so: 'Makhaayadaha & Cuntooyinka',
    },
    description: {
      ar: 'وجبات ساخنة، برغر، بيتزا، وأطباق تقليدية طازجة مع خدمة توصيل فورية',
      en: 'Fresh meals, burgers, pizza, and authentic dishes delivered fast',
      so: 'Cuntooyin macaan, bargaro, biisa iyo cunto dhaqameed si degdeg ah lagu keeno',
    },
    icon: 'UtensilsCrossed',
    path: '/restaurants',
    accentColor: '#F97316',
  },
  {
    id: 'stores',
    slug: 'stores',
    name: {
      ar: 'المتاجر والشركاء',
      en: 'Verified Stores',
      so: 'Dukaamada La Xaqiijiyay',
    },
    description: {
      ar: 'متاجر تجزئة معتمدة وبوتيكات رسمية بمختلف التخصصات والضمانات',
      en: 'Verified retail outlets, specialized boutiques, and official merchants',
      so: 'Dukaamada rasmiga ah iyo kuwa la aamini karo ee ku yaalla magaaladaada',
    },
    icon: 'Store',
    path: '/stores',
    accentColor: '#2563EB',
  },
  {
    id: 'services',
    slug: 'services',
    name: {
      ar: 'الخدمات الاحترافية',
      en: 'Professional Services',
      so: 'Adeegyada Xirfadeed',
    },
    description: {
      ar: 'برمجة، تصميم، تسويق، صيانة تقنية، واستشارات أعمال مع خيارات حجز مرنة',
      en: 'Coding, design, branding, tech maintenance, and flexible business bookings',
      so: 'Adeegyada farsamada, naqshadaynta, dayactirka iyo la-talinta ganacsiga',
    },
    icon: 'Wrench',
    path: '/services',
    accentColor: '#10B981',
  },
  {
    id: 'offers',
    slug: 'offers',
    name: {
      ar: 'العروض والتخفيضات',
      en: 'Flash Deals & Offers',
      so: 'Dalabyada & Dhimista',
    },
    description: {
      ar: 'خصومات حصرية تصل إلى 50% وتخفيضات محدودة على المنتجات والوجبات',
      en: 'Exclusive seasonal bundles and flash discounts across all categories',
      so: 'Dhimisyo gaar ah iyo qiimo dhimis ilaa 50% ah oo xaddidan',
    },
    icon: 'Tag',
    badge: { ar: 'توفير حتى 50%', en: 'Up to 50% OFF', so: 'Ilaa 50% Dhimis' },
    path: '/offers',
    accentColor: '#E11D48',
  },
  {
    id: 'ads',
    slug: 'ads',
    name: {
      ar: 'الإعلانات المميزة',
      en: 'Sponsored Showcase',
      so: 'Xayeysiisyada Gaarka ah',
    },
    description: {
      ar: 'إعلانات الشركاء التجاريين وفرص الاستثمار والصفقات المعلنة',
      en: 'Verified commercial sponsor promotions and featured business campaigns',
      so: 'Xayeysiisyada ganacsiyada iyo fursadaha maalgashi ee la xaqiijiyay',
    },
    icon: 'Megaphone',
    path: '/ads',
    accentColor: '#F59E0B',
  },
];

/**
 * SHOP / NEW CATEGORIES
 */
export const SHOP_NEW_CATEGORIES: TaxonomyCategory[] = [
  {
    id: 'electronics',
    slug: 'electronics',
    name: { ar: 'الإلكترونيات والتقنية', en: 'Electronics & Gadgets', so: 'Elektarooniga & Qalabka' },
    icon: 'Smartphone',
    accentColor: '#3B82F6',
    subcategories: [
      { id: 'phones', slug: 'phones', name: { ar: 'الهواتف الذكية', en: 'Smartphones', so: 'Telefoonada Casriga' } },
      { id: 'laptops', slug: 'laptops', name: { ar: 'أجهزة الكمبيوتر', en: 'Computers & Laptops', so: 'Kumbuyuutarada' } },
      { id: 'audio', slug: 'audio', name: { ar: 'السماعات والصوتيات', en: 'Headphones & Audio', so: 'Dhegaha & Codka' } },
      { id: 'accessories', slug: 'accessories', name: { ar: 'إكسسوارات الشحن والكابلات', en: 'Cables & Chargers', so: 'Xadhkaha & Qalabka' } },
    ],
  },
  {
    id: 'fashion',
    slug: 'fashion',
    name: { ar: 'الأزياء والملابس', en: 'Fashion & Apparel', so: 'Dharka & Moodada' },
    icon: 'Shirt',
    accentColor: '#EC4899',
    subcategories: [
      { id: 'men', slug: 'men', name: { ar: 'ملابس رجالية', en: "Men's Wear", so: 'Dharka Ragga' } },
      { id: 'women', slug: 'women', name: { ar: 'ملابس نسائية', en: "Women's Wear", so: 'Dharka Dumarka' } },
      { id: 'shoes', slug: 'shoes', name: { ar: 'الأحذية الرياضية والأنيقة', en: 'Footwear', so: 'Kabaal' } },
      { id: 'watches', slug: 'watches', name: { ar: 'الساعات والنظارات', en: 'Watches & Eyewear', so: 'Saacadaha & Muraayadaha' } },
    ],
  },
  {
    id: 'beauty',
    slug: 'beauty',
    name: { ar: 'الجمال والعناية', en: 'Beauty & Skincare', so: 'Quruxda & Daryeelka' },
    icon: 'Sparkles',
    accentColor: '#8B5CF6',
    subcategories: [
      { id: 'skincare', slug: 'skincare', name: { ar: 'كريمات وسيرومات الوجه', en: 'Skincare Serums & Creams', so: 'Kareemyada Wajiga' } },
      { id: 'fragrance', slug: 'fragrance', name: { ar: 'العطور الأصلية', en: 'Original Perfumes', so: 'Carafyada Asalka ah' } },
      { id: 'haircare', slug: 'haircare', name: { ar: 'زيوت وعناية الشعر', en: 'Hair Care & Oils', so: 'Daryeelka Timaha' } },
    ],
  },
  {
    id: 'home',
    slug: 'home',
    name: { ar: 'المنزل والمطبخ', en: 'Home & Kitchen', so: 'Guriga & Jikada' },
    icon: 'Home',
    accentColor: '#10B981',
    subcategories: [
      { id: 'kitchen', slug: 'kitchen', name: { ar: 'مستلزمات المطبخ الذكية', en: 'Kitchenware', so: 'Qalabka Jikada' } },
      { id: 'decor', slug: 'decor', name: { ar: 'الديكور والإضاءة', en: 'Home Decor', so: 'Qurxinta Guriga' } },
      { id: 'appliances', slug: 'appliances', name: { ar: 'الأجهزة الكهربائية', en: 'Small Appliances', so: 'Qalabka Korontada' } },
    ],
  },
  {
    id: 'sports',
    slug: 'sports',
    name: { ar: 'الرياضة واللياقة', en: 'Sports & Fitness', so: 'Ciyaaraha & Jimicsiga' },
    icon: 'Dumbbell',
    accentColor: '#F59E0B',
    subcategories: [
      { id: 'gym', slug: 'gym', name: { ar: 'أدوات اللياقة البدنية', en: 'Gym Equipment', so: 'Qalabka Jimicsiga' } },
      { id: 'outdoor', slug: 'outdoor', name: { ar: 'مستلزمات الرحلات', en: 'Outdoor & Camping', so: 'Qalabka Safarka' } },
    ],
  },
];

/**
 * SHOP / USED CATEGORIES
 */
export const SHOP_USED_CATEGORIES: TaxonomyCategory[] = [
  {
    id: 'phones',
    slug: 'phones',
    name: { ar: 'هواتف مستعملة مفحوصة', en: 'Pre-Owned Phones', so: 'Telefoonno La Hubiyay' },
    icon: 'Smartphone',
    accentColor: '#3B82F6',
    description: { ar: 'آيفون وسامسونج مفحوصة مع ضمان تجربة', en: 'Inspected iPhones and Samsungs with warranty', so: 'IPhone iyo Samsung la hubiyay' },
  },
  {
    id: 'laptops',
    slug: 'laptops',
    name: { ar: 'لابتوبات مستعملة', en: 'Used Laptops', so: 'Labbtoobyo La Isticmaalay' },
    icon: 'Laptop',
    accentColor: '#6366F1',
    description: { ar: 'أجهزة ماك بوك وديل ولينوفو للمهنيين والطلاب', en: 'MacBooks, Dell, and ThinkPads in prime condition', so: 'MacBook iyo Dell xaalad fiican ku sugan' },
  },
  {
    id: 'electronics',
    slug: 'electronics',
    name: { ar: 'أجهزة وإلكترونيات', en: 'Used Electronics', so: 'Qalabka Korontada' },
    icon: 'Tv',
    accentColor: '#8B5CF6',
  },
  {
    id: 'appliances',
    slug: 'appliances',
    name: { ar: 'أجهزة منزلية', en: 'Home Appliances', so: 'Qalabka Guriga' },
    icon: 'Refrigerator',
    accentColor: '#10B981',
  },
  {
    id: 'furniture',
    slug: 'furniture',
    name: { ar: 'أثاث ومكتبيات', en: 'Used Furniture', so: 'Alaabta Guriga' },
    icon: 'Armchair',
    accentColor: '#F59E0B',
  },
  {
    id: 'vehicles',
    slug: 'vehicles',
    name: { ar: 'دراجات ومركبات', en: 'Vehicles & Bikes', so: 'Gaadiidka & Baaskiilada' },
    icon: 'Car',
    accentColor: '#EF4444',
  },
];

/**
 * SHOP / DROPSHIPPING CATEGORIES
 */
export const SHOP_DROPSHIPPING_CATEGORIES: TaxonomyCategory[] = [
  {
    id: 'fashion',
    slug: 'fashion',
    name: { ar: 'صيحات الموضة العالمية (شين)', en: 'Global Trendy Fashion', so: 'Moodada Caalamiga ah' },
    icon: 'Boxes',
    accentColor: '#EC4899',
    description: { ar: 'أحدث ملابس شين وأزياء موسمية مباشرة لمقديشو', en: 'Trendy direct Shein styles shipped with buyer security', so: 'Dharka ugu dambeeyay ee Shein' },
  },
  {
    id: 'gadgets',
    slug: 'gadgets',
    name: { ar: 'أجهزة واختراعات ذكية', en: 'Smart Gadgets & Innovations', so: 'Qalabka Farsamada Cusub' },
    icon: 'Zap',
    accentColor: '#3B82F6',
    description: { ar: 'ابتكارات إلكترونية نادرة من علي إكسبريس وعلي بابا', en: 'Curated trending gadgets from AliExpress & Alibaba', so: 'Qalab farsamo oo casri ah' },
  },
  {
    id: 'beauty-tools',
    slug: 'beauty-tools',
    name: { ar: 'أجهزة التجميل والعناية الشخصية', en: 'Beauty Tools & Tech', so: 'Qalabka Qurxinta' },
    icon: 'Sparkles',
    accentColor: '#8B5CF6',
  },
  {
    id: 'home-innovations',
    slug: 'home-innovations',
    name: { ar: 'أدوات المطبخ والمنزل المبتكرة', en: 'Kitchen & Home Hacks', so: 'Qalabka Guriga ee Casriga ah' },
    icon: 'Home',
    accentColor: '#10B981',
  },
  {
    id: 'accessories',
    slug: 'accessories',
    name: { ar: 'حقائب وساعات وأحزمة', en: 'Bags & Accessories', so: 'Boorsooyinka & Saacadaha' },
    icon: 'Watch',
    accentColor: '#F59E0B',
  },
];

/**
 * RESTAURANT CUISINES
 */
export const RESTAURANT_CUISINES: TaxonomyCategory[] = [
  {
    id: 'burgers',
    slug: 'burgers',
    name: { ar: 'برغر وساندويتش', en: 'Burgers & Sandwiches', so: 'Bargaro & Roodhi' },
    icon: 'UtensilsCrossed',
    accentColor: '#F97316',
  },
  {
    id: 'pizza',
    slug: 'pizza',
    name: { ar: 'بيتزا وفطائر إيطالية', en: 'Pizza & Italian', so: 'Biisa & Cunto Talyaani' },
    icon: 'Utensils',
    accentColor: '#EF4444',
  },
  {
    id: 'traditional',
    slug: 'traditional',
    name: { ar: 'مأكولات صومالية تقليدية', en: 'Traditional Somali Dishes', so: 'Cunto Dhaqameed Soomaali' },
    icon: 'Soup',
    accentColor: '#84CC16',
  },
  {
    id: 'grills',
    slug: 'grills',
    name: { ar: 'مشويات وشاورما', en: 'Grills & Shawarma', so: 'Hilib Duban & Shawarma' },
    icon: 'Flame',
    accentColor: '#EA580C',
  },
  {
    id: 'seafood',
    slug: 'seafood',
    name: { ar: 'مأكولات بحرية وأسماك', en: 'Fresh Seafood', so: 'Cuntooyinka Badda' },
    icon: 'Fish',
    accentColor: '#06B6D4',
  },
  {
    id: 'cafe',
    slug: 'cafe',
    name: { ar: 'عصائر وحلويات وكافيه', en: 'Cafe, Juices & Sweets', so: 'Cabitaanno & Macmacaan' },
    icon: 'Coffee',
    accentColor: '#D97706',
  },
];

/**
 * STORE CATEGORIES
 */
export const STORE_CATEGORIES: TaxonomyCategory[] = [
  {
    id: 'tech',
    slug: 'tech',
    name: { ar: 'الإلكترونيات والتقنية', en: 'Tech & Electronics', so: 'Elektarooniga & Farsamada' },
    icon: 'Smartphone',
    accentColor: '#3B82F6',
  },
  {
    id: 'fashion',
    slug: 'fashion',
    name: { ar: 'الملابس والأزياء', en: 'Fashion & Apparel', so: 'Dharka & Moodada' },
    icon: 'Shirt',
    accentColor: '#EC4899',
  },
  {
    id: 'cosmetics',
    slug: 'cosmetics',
    name: { ar: 'العطور ومستحضرات التجميل', en: 'Perfumes & Cosmetics', so: 'Carafyada & Quruxda' },
    icon: 'Sparkles',
    accentColor: '#8B5CF6',
  },
  {
    id: 'furniture',
    slug: 'furniture',
    name: { ar: 'الأثاث والمفروشات', en: 'Home & Furniture', so: 'Alaabta Guriga' },
    icon: 'Home',
    accentColor: '#10B981',
  },
  {
    id: 'supermarket',
    slug: 'supermarket',
    name: { ar: 'السوبرماركت والغذائيات', en: 'Supermarkets & Groceries', so: 'Raashinka & Cuntada' },
    icon: 'ShoppingBag',
    accentColor: '#F59E0B',
  },
];

/**
 * SERVICE CATEGORIES
 */
export const SERVICE_CATEGORIES: TaxonomyCategory[] = [
  {
    id: 'dev',
    slug: 'dev',
    name: { ar: 'البرمجة وتطوير المواقع', en: 'Software & Web Dev', so: 'Horumarinta Software' },
    icon: 'Code',
    accentColor: '#3B82F6',
  },
  {
    id: 'design',
    slug: 'design',
    name: { ar: 'التصميم الجرافيكي والهوية', en: 'Graphic Design & Branding', so: 'Naqshadaynta Summadda' },
    icon: 'Palette',
    accentColor: '#EC4899',
  },
  {
    id: 'maintenance',
    slug: 'maintenance',
    name: { ar: 'الدعم التقني والصيانة', en: 'IT Support & Maintenance', so: 'Taageerada Farsamada' },
    icon: 'Wrench',
    accentColor: '#10B981',
  },
  {
    id: 'consulting',
    slug: 'consulting',
    name: { ar: 'الاستشارات وإدارة الأعمال', en: 'Consulting & Business', so: 'La-talinta Ganacsiga' },
    icon: 'Briefcase',
    accentColor: '#8B5CF6',
  },
  {
    id: 'media',
    slug: 'media',
    name: { ar: 'التصوير والمونتاج الإعلاني', en: 'Media & Video Production', so: 'Soo-saarista Fiidiyowga' },
    icon: 'Video',
    accentColor: '#F59E0B',
  },
];

/**
 * Backward-Compatible Classification Resolver
 * Maps any existing product safely into authoritative classification tokens.
 */
export function getProductClassification(product: Product): {
  marketplaceType: MarketplaceType;
  productCondition: ProductCondition;
  isOffer: boolean;
  category: string;
  subcategory?: string;
} {
  // 1. Determine marketplaceType
  let marketplaceType: MarketplaceType = product.marketplaceType || 'shop';
  if (!product.marketplaceType) {
    if (product.type === 'restaurants' || product.type === 'restaurant-products') {
      marketplaceType = 'restaurants';
    } else if (product.type === 'services') {
      marketplaceType = 'services';
    } else if (product.type === 'stores' || product.type === 'store-products') {
      marketplaceType = 'stores';
    } else if (product.type === 'ads') {
      marketplaceType = 'ads';
    } else {
      marketplaceType = 'shop';
    }
  }

  // 2. Determine productCondition
  let productCondition: ProductCondition = product.productCondition || 'new';
  if (!product.productCondition) {
    if (product.type === 'used' || product.category === 'used' || product.condition) {
      productCondition = 'used';
    } else if (product.type === 'dropshipping' || product.category === 'dropshipping' || product.supplier) {
      productCondition = 'dropshipping';
    } else {
      productCondition = 'new';
    }
  }

  // 3. Determine promotion/offer state
  const isOffer = Boolean(
    product.isOffer ||
    (product.discount && product.discount > 0) ||
    (product.oldPrice && product.oldPrice > product.price)
  );

  return {
    marketplaceType,
    productCondition,
    isOffer,
    category: product.category || 'all',
    subcategory: product.subcategory,
  };
}

export const taxonomyService = {
  getDomains: () => MARKETPLACE_DOMAINS,
  getNewCategories: () => SHOP_NEW_CATEGORIES,
  getUsedCategories: () => SHOP_USED_CATEGORIES,
  getDropshippingCategories: () => SHOP_DROPSHIPPING_CATEGORIES,
  getRestaurantCuisines: () => RESTAURANT_CUISINES,
  getStoreCategories: () => STORE_CATEGORIES,
  getServiceCategories: () => SERVICE_CATEGORIES,
  classify: getProductClassification,
};
