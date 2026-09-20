import { CategoryInfo } from '../types';

export const categoriesData: CategoryInfo[] = [
  {
    id: 'products',
    slug: 'products',
    name: {
      ar: 'التسوق والمنتجات',
      en: 'Products & Shopping',
      so: 'Alaabooyinka & Dukaamaysiga',
    },
    icon: 'ShoppingBag',
    description: {
      ar: 'مستحضرات التجميل، العناية بالبشرة، والكريمات الأصلية',
      en: 'Cosmetics, skincare, beauty and personal care essentials',
      so: 'Waxyaabaha la isku qurxiyo, daryeelka maqaarka iyo kareemyada',
    },
    accentColor: '#7C3AED',
    itemCount: 18,
  },
  {
    id: 'restaurants',
    slug: 'restaurants',
    name: {
      ar: 'المطاعم والوجبات',
      en: 'Restaurants & Meals',
      so: 'Makhaayadaha & Cuntooyinka',
    },
    icon: 'UtensilsCrossed',
    description: {
      ar: 'وجبات سريعة، مشويات، برغر، وبيتزا مع توصيل سريع وسهل',
      en: 'Fast food, burger joints, grilled meals and fresh delivery',
      so: 'Cuntooyin degdeg ah, bargaro, digaag iyo gaarsiin degdeg ah',
    },
    accentColor: '#F97316',
    itemCount: 14,
  },
  {
    id: 'stores',
    slug: 'stores',
    name: {
      ar: 'المتاجر والبائعين',
      en: 'Stores & Vendors',
      so: 'Dukaamada & Iibiyayaasha',
    },
    icon: 'Store',
    description: {
      ar: 'متاجر معتمدة وموردون موثوقون في منصة MarketSpace',
      en: 'Verified merchant stores and official vendor outlets',
      so: 'Dukaamo la xaqiijiyay iyo iibiyeyaal la aamini karo',
    },
    accentColor: '#F43F5E',
    itemCount: 9,
  },
  {
    id: 'services',
    slug: 'services',
    name: {
      ar: 'الخدمات الاحترافية',
      en: 'Professional Services',
      so: 'Adeegyada Xirfadeed',
    },
    icon: 'Wrench',
    description: {
      ar: 'برمجة، تصميم جرافيك، إعلانات، وصيانة تقنية',
      en: 'Programming, graphic design, advertising, and technical support',
      so: 'Barmaamijyada, nashqadeynta, xayeysiiska iyo taageerada',
    },
    accentColor: '#10B981',
    itemCount: 8,
  },
  {
    id: 'dropshipping',
    slug: 'dropshipping',
    name: {
      ar: 'دروبشيبينغ العالمي',
      en: 'Global Dropshipping',
      so: 'Dropshipping Caalami ah',
    },
    icon: 'Boxes',
    description: {
      ar: 'مستوردات شين، علي إكسبريس، وعلي بابا بأفضل الأسعار',
      en: 'Curated products from Shein, AliExpress, and Alibaba',
      so: 'Alaab laga keenay Shein, AliExpress, iyo Alibaba',
    },
    accentColor: '#2563EB',
    itemCount: 15,
  },
  {
    id: 'offers',
    slug: 'offers',
    name: {
      ar: 'العروض والتخفيضات',
      en: 'Deals & Offers',
      so: 'Dalabyada & Dhimista',
    },
    icon: 'Tag',
    description: {
      ar: 'خصومات يومية تصل إلى 50% وتخفيضات موسمية حصرية',
      en: 'Daily flash sales, up to 50% discounts and limited bundles',
      so: 'Dhimis maalinle ah oo gaaraysa ilaa 50% iyo dalabyo xaddidan',
    },
    accentColor: '#E11D48',
    itemCount: 12,
  },
  {
    id: 'used',
    slug: 'used',
    name: {
      ar: 'الأجهزة والمستعمل',
      en: 'Used & Pre-Owned',
      so: 'Alaab La Isticmaalay',
    },
    icon: 'Recycle',
    description: {
      ar: 'هواتف وأجهزة مستعملة بحالة ممتازة وفحص دقيق',
      en: 'Inspected pre-owned electronics, phones, and verified gear',
      so: 'Telefoonno iyo qalab la isticmaalay oo xaalad fiican ku sugan',
    },
    accentColor: '#059669',
    itemCount: 10,
  },
  {
    id: 'ads',
    slug: 'ads',
    name: {
      ar: 'الإعلانات المميزة',
      en: 'Sponsored Ads',
      so: 'Xayeysiisyada Gaarka ah',
    },
    icon: 'Megaphone',
    description: {
      ar: 'إعلانات الشركات والفرص التجارية الشريكة',
      en: 'Sponsored brand campaigns, listings, and promotions',
      so: 'Xayeysiisyada shirkadaha iyo fursadaha ganacsi',
    },
    accentColor: '#F59E0B',
    itemCount: 6,
  },
];
