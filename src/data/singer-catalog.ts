export type SingerCatalogEntry = { name: string; country: string };

export const SINGER_CATALOG: SingerCatalogEntry[] = [
  { country: 'India', name: 'Arijit Singh' }, { country: 'India', name: 'Shreya Ghoshal' }, { country: 'India', name: 'Sonu Nigam' }, { country: 'India', name: 'A. R. Rahman' }, { country: 'India', name: 'Vishal Mishra' },
  { country: 'Pakistan', name: 'Atif Aslam' }, { country: 'Pakistan', name: 'Rahat Fateh Ali Khan' }, { country: 'Pakistan', name: 'Ali Zafar' }, { country: 'Pakistan', name: 'Abida Parveen' },
  { country: 'United States', name: 'Taylor Swift' }, { country: 'United States', name: 'Beyoncé' }, { country: 'United States', name: 'Billie Eilish' }, { country: 'United States', name: 'Bruno Mars' }, { country: 'United States', name: 'Ariana Grande' },
  { country: 'United Kingdom', name: 'Adele' }, { country: 'United Kingdom', name: 'Ed Sheeran' }, { country: 'United Kingdom', name: 'Dua Lipa' }, { country: 'United Kingdom', name: 'Sam Smith' }, { country: 'United Kingdom', name: 'Harry Styles' },
  { country: 'Nigeria', name: 'Burna Boy' }, { country: 'Nigeria', name: 'Wizkid' }, { country: 'Nigeria', name: 'Davido' }, { country: 'Nigeria', name: 'Tems' },
  { country: 'South Korea', name: 'IU' }, { country: 'South Korea', name: 'PSY' }, { country: 'South Korea', name: 'Taeyeon' }, { country: 'South Korea', name: 'Jungkook' },
  { country: 'Japan', name: 'Ado' }, { country: 'Japan', name: 'YOASOBI' }, { country: 'Japan', name: 'Kenshi Yonezu' }, { country: 'Japan', name: 'Hikaru Utada' },
  { country: 'Brazil', name: 'Anitta' }, { country: 'Brazil', name: 'Ivete Sangalo' }, { country: 'Brazil', name: 'Ludmilla' }, { country: 'Brazil', name: 'Alok' },
  { country: 'Mexico', name: 'Luis Miguel' }, { country: 'Mexico', name: 'Natalia Lafourcade' }, { country: 'Mexico', name: 'Carín León' }, { country: 'Mexico', name: 'Danna' },
  { country: 'Egypt', name: 'Amr Diab' }, { country: 'Egypt', name: 'Sherine' }, { country: 'Egypt', name: 'Tamer Hosny' }, { country: 'Egypt', name: 'Angham' },
  { country: 'Canada', name: 'The Weeknd' }, { country: 'Canada', name: 'Justin Bieber' }, { country: 'Canada', name: 'Céline Dion' }, { country: 'Canada', name: 'Shawn Mendes' },
  { country: 'Australia', name: 'Sia' }, { country: 'Australia', name: 'Kylie Minogue' }, { country: 'Australia', name: 'Troye Sivan' }, { country: 'Australia', name: 'The Kid LAROI' },
  { country: 'South Africa', name: 'Tyla' }, { country: 'South Africa', name: 'Elaine' }, { country: 'South Africa', name: 'Master KG' }, { country: 'South Africa', name: 'Sho Madjozi' },
  { country: 'France', name: 'Aya Nakamura' }, { country: 'France', name: 'Gims' }, { country: 'France', name: 'Zaz' }, { country: 'France', name: 'Indila' },
  { country: 'Germany', name: 'Helene Fischer' }, { country: 'Germany', name: 'Nina Chuba' }, { country: 'Germany', name: 'Sarah Connor' }, { country: 'Germany', name: 'Mark Forster' },
  { country: 'Turkey', name: 'Tarkan' }, { country: 'Turkey', name: 'Sezen Aksu' }, { country: 'Turkey', name: 'Edis' }, { country: 'Turkey', name: 'Simge' },
  { country: 'Italy', name: 'Laura Pausini' }, { country: 'Italy', name: 'Andrea Bocelli' }, { country: 'Italy', name: 'Mahmood' }, { country: 'Italy', name: 'Måneskin' },
  { country: 'Indonesia', name: 'Anggun' }, { country: 'Indonesia', name: 'Raisa' }, { country: 'Indonesia', name: 'Isyana Sarasvati' }, { country: 'Indonesia', name: 'Tulus' },
  { country: 'Spain', name: 'Rosalía' }, { country: 'Spain', name: 'Enrique Iglesias' }, { country: 'Spain', name: 'Alejandro Sanz' }, { country: 'Spain', name: 'Aitana' },
  { country: 'Bangladesh', name: 'Tahsan' }, { country: 'Bangladesh', name: 'Habib Wahid' }, { country: 'Bangladesh', name: 'Kona' }, { country: 'Bangladesh', name: 'Asif Akbar' },
];

export const SINGER_COUNTRIES = [...new Set(SINGER_CATALOG.map((entry) => entry.country))];
