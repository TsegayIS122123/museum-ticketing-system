// 5 Ethiopian Categories from FR-CAT-001
export const SEEDED_CATEGORIES = [
  {
    id: '1',
    nameEn: 'Student',
    nameAm: 'ተማሪ',
    priceEtb: 50,
    isFree: false,
    descriptionEn: 'Valid student ID required',
    descriptionAm: 'ትክክለኛ የተማሪ መታወቂያ ያስፈልጋል'
  },
  {
    id: '2',
    nameEn: 'Adult / Teacher',
    nameAm: 'አዋቂ / መምህር',
    priceEtb: 100,
    isFree: false,
    descriptionEn: 'Standard adult admission',
    descriptionAm: 'መደበኛ የአዋቂ መግቢያ'
  },
  {
    id: '3',
    nameEn: 'Foreign Resident',
    nameAm: 'የውጭ ነዋሪ',
    priceEtb: 300,
    isFree: false,
    descriptionEn: 'Foreign residents in Ethiopia',
    descriptionAm: 'በኢትዮጵያ ውስጥ የውጭ ነዋሪዎች'
  },
  {
    id: '4',
    nameEn: 'Non-Resident',
    nameAm: 'የውጭ ዜጋ',
    priceEtb: 500,
    isFree: false,
    descriptionEn: 'Tourists and non-residents',
    descriptionAm: 'ቱሪስቶች እና ነዋሪ ያልሆኑ'
  },
  {
    id: '5',
    nameEn: 'Exempt / Free',
    nameAm: 'ከክፍያ ነፃ',
    priceEtb: 0,
    isFree: true,
    descriptionEn: 'AAU staff with valid ID',
    descriptionAm: 'ትክክለኛ መታወቂያ ያላቸው የአአዩ ሰራተኞች'
  }
];

export type Category = typeof SEEDED_CATEGORIES[0];
