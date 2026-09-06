export interface GallerySpecimen {
  id: string;
  nameEn: string;
  nameAm: string;
  categoryEn: string;
  categoryAm: string;
  src: string;
}

/**
 * Roster for the homepage's sliding specimen gallery -- one preserved
 * specimen per animal category (mammal, bird, reptile, ...), each a
 * stand-in for the actual museum collection rather than a stock photo.
 *
 * Only the Walia Ibex has been photographed so far, so it's the only
 * entry below and the gallery repeats it across every slot. Add the
 * next category's photo as a new entry here -- drop the file in
 * `public/gallery/`, add a line below -- and the gallery picks it up
 * automatically; nothing in SpecimenGallery.tsx needs to change.
 */
export const specimens: GallerySpecimen[] = [
  {
    id: 'walia-ibex',
    nameEn: 'Walia Ibex',
    nameAm: 'ዋልያ',
    categoryEn: 'Mammal',
    categoryAm: 'አጥቢ እንስሳ',
    src: '/gallery/walia-ibex.jpg',
  },
];
