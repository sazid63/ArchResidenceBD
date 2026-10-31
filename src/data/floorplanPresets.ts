/**
 * Pre-built Architectural Floor Plan Presets for ArchResidenceBD
 * Designed according to BNBC 2020 Part 3 Chapter 2 & RAJUK 2008
 */

export interface RoomPartition {
  id: string;
  nameEn: string;
  nameBn: string;
  kind: "bedroom" | "living" | "dining" | "kitchen" | "bath" | "balcony" | "corridor" | "stair";
  boundsRel: [number, number, number, number]; // [minXPct, minYPct, maxXPct, maxYPct] 0 to 1
  /** Optional non-rectangular outline (axis-aligned polygon, relative 0-1 coords, closed).
   *  When present, walls are synthesized from the polygon edges instead of the AABB. */
  pointsRel?: [number, number][];
  /** Open space: no walls or fixtures of its own (parking bays, courtyards, airshafts, decks). */
  open?: boolean;
  doorSide?: "front" | "rear" | "left" | "right" | "inner";
  windowSide?: "front" | "rear" | "left" | "right" | "inner";
}

export interface FloorplanPreset {
  id: string;
  nameEn: string;
  nameBn: string;
  unitsCount: number;
  suitablePlotKatha: string;
  descriptionEn: string;
  descriptionBn: string;
  rooms: RoomPartition[];
}

export const FLOORPLAN_PRESETS: FloorplanPreset[] = [
  {
    id: "preset-dual-3bed",
    nameEn: "Type A: Dual 3-Bed Flats (2 Units / Floor)",
    nameBn: "টাইপ এ: দুই ইউনিট (প্রতিটিতে ৩ বেড, ৩ বাথ, ২ বারান্দা)",
    unitsCount: 2,
    suitablePlotKatha: "3.0 – 5.0 Katha",
    descriptionEn: "Most popular Bangladeshi residential plan. Split into Front Unit A & Rear Unit B with central stair/lift lobby corridor.",
    descriptionBn: "বাংলাদেশের সর্বাধিক জনপ্রিয় দ্বৈত ফ্ল্যাট বিন্যাস। সামনে ও পেছনে ২টি ফ্ল্যাট এবং মাঝে সেন্ট্রাল লিফট-সিঁড়ি লবি।",
    rooms: [
      // Unit A (Front Flat)
      { id: "uA_master", nameEn: "Unit A Master Bed", nameBn: "ইউনিট এ মাস্টার বেড", kind: "bedroom", boundsRel: [0.05, 0.56, 0.45, 0.95], doorSide: "rear", windowSide: "front" },
      { id: "uA_bed2", nameEn: "Unit A Bed 2", nameBn: "ইউনিট এ বেড ২", kind: "bedroom", boundsRel: [0.05, 0.35, 0.40, 0.56], doorSide: "right", windowSide: "left" },
      { id: "uA_living", nameEn: "Unit A Drawing & Dining", nameBn: "ইউনিট এ ড্রয়িং-ডাইনিং", kind: "living", boundsRel: [0.45, 0.50, 0.80, 0.95], doorSide: "left", windowSide: "front" },
      { id: "uA_kitchen", nameEn: "Unit A Kitchen", nameBn: "ইউনিট এ রান্নাঘর", kind: "kitchen", boundsRel: [0.80, 0.70, 0.95, 0.95], doorSide: "left", windowSide: "right" },
      { id: "uA_bath1", nameEn: "Unit A Master Bath", nameBn: "ইউনিট এ মাস্টার বাথ", kind: "bath", boundsRel: [0.45, 0.35, 0.60, 0.50], doorSide: "rear", windowSide: "left" },
      { id: "uA_bath2", nameEn: "Unit A Common Bath", nameBn: "ইউনিট এ সাধারণ বাথ", kind: "bath", boundsRel: [0.60, 0.35, 0.75, 0.50], doorSide: "rear", windowSide: "right" },

      // Central Stair & Lift Core
      { id: "core_stair", nameEn: "Stair & Lift Core Lobby", nameBn: "সিঁড়ি ও লিফট লবি", kind: "stair", boundsRel: [0.35, 0.05, 0.65, 0.25], doorSide: "front", windowSide: "rear" },

      // Unit B (Rear Flat)
      { id: "uB_master", nameEn: "Unit B Master Bed", nameBn: "ইউনিট বি মাস্টার বেড", kind: "bedroom", boundsRel: [0.05, 0.05, 0.35, 0.25], doorSide: "front", windowSide: "rear" },
      { id: "uB_living", nameEn: "Unit B Drawing & Dining", nameBn: "ইউনিট বি ড্রয়িং-ডাইনিং", kind: "living", boundsRel: [0.65, 0.05, 0.95, 0.30], doorSide: "left", windowSide: "rear" },
      { id: "uB_kitchen", nameEn: "Unit B Kitchen", nameBn: "ইউনিট বি রান্নাঘর", kind: "kitchen", boundsRel: [0.75, 0.30, 0.95, 0.45], doorSide: "left", windowSide: "right" },
      { id: "uB_bath1", nameEn: "Unit B Master Bath", nameBn: "ইউনিট বি বাথরুম", kind: "bath", boundsRel: [0.05, 0.25, 0.25, 0.35], doorSide: "front", windowSide: "left" },
    ],
  },
  {
    id: "preset-single-luxury",
    nameEn: "Type B: Single Executive Full-Floor Flat (1 Unit / Floor)",
    nameBn: "টাইপ বি: একক লাক্সারি ফুল-ফ্লোর ফ্ল্যাট (১ ইউনিট/তলা)",
    unitsCount: 1,
    suitablePlotKatha: "3.5 – 6.0 Katha",
    descriptionEn: "Spacious full-floor flat with 4 Bedrooms, Family Living, Formal Dining, Servant Suite, and 3 Large Balconies.",
    descriptionBn: "সম্পূর্ণ ফ্লোর জুড়ে বিস্তৃত ৪ বেডরুমের রাজকীয় ফ্ল্যাট। ফ্যামিলি লিভিং, ফরমাল ডাইনিং ও ৩টি চওড়া বারান্দা সহ।",
    rooms: [
      { id: "lux_master", nameEn: "Master Suite", nameBn: "মাস্টার সুইট", kind: "bedroom", boundsRel: [0.05, 0.60, 0.45, 0.95], doorSide: "rear", windowSide: "front" },
      { id: "lux_bed2", nameEn: "Bedroom 2", nameBn: "বেডরুম ২", kind: "bedroom", boundsRel: [0.55, 0.60, 0.95, 0.95], doorSide: "rear", windowSide: "front" },
      { id: "lux_bed3", nameEn: "Bedroom 3", nameBn: "বেডরুম ৩", kind: "bedroom", boundsRel: [0.05, 0.15, 0.35, 0.45], doorSide: "front", windowSide: "rear" },
      { id: "lux_guest", nameEn: "Guest Bedroom", nameBn: "গেস্ট বেডরুম", kind: "bedroom", boundsRel: [0.65, 0.15, 0.95, 0.45], doorSide: "front", windowSide: "rear" },
      { id: "lux_living", nameEn: "Family Living Hall", nameBn: "ফ্যামিলি লিভিং হল", kind: "living", boundsRel: [0.25, 0.45, 0.75, 0.60], doorSide: "rear", windowSide: "left" },
      { id: "lux_dining", nameEn: "Formal Dining Hall", nameBn: "ফরমাল ডাইনিং", kind: "dining", boundsRel: [0.35, 0.15, 0.65, 0.33], doorSide: "front", windowSide: "right" },
      { id: "lux_kitchen", nameEn: "Chef Kitchen", nameBn: "রান্নাঘর", kind: "kitchen", boundsRel: [0.75, 0.45, 0.95, 0.60], doorSide: "left", windowSide: "right" },
      { id: "lux_bath1", nameEn: "Master Bath & Closet", nameBn: "মাস্টার বাথ ও ড্রেসিং", kind: "bath", boundsRel: [0.45, 0.75, 0.55, 0.95], doorSide: "left", windowSide: "front" },
      { id: "lux_bath2", nameEn: "Common Bath", nameBn: "সাধারণ বাথরুম", kind: "bath", boundsRel: [0.35, 0.33, 0.50, 0.45], doorSide: "rear", windowSide: "left" },
    ],
  },
  {
    id: "preset-ground-parking",
    nameEn: "Ground Floor: Parking, Guard Suite & Driveway",
    nameBn: "নিচতলা: কার পার্কিং, গার্ড রুম ও ড্রাইভওয়ে",
    unitsCount: 0,
    suitablePlotKatha: "All Plot Sizes",
    descriptionEn: "Ground floor parking layout with 6 car bays, driveway ramp, security caretaker office, and driver's restroom.",
    descriptionBn: "নিচতলার বিন্যাস: ৬টি কার পার্কিং বে, চওড়া ড্রাইভওয়ে, সিকিউরিটি গার্ড পোস্ট ও ড্রাইভার্স ওয়াশরুম।",
    rooms: [
      { id: "g_driveway", nameEn: "Clear Driveway & Ramp", nameBn: "ড্রাইভওয়ে ও প্রবেশ পথ", kind: "corridor", boundsRel: [0.30, 0.05, 0.70, 0.95], doorSide: "front", open: true },
      { id: "g_parking_l", nameEn: "West Parking Bays (3 Cars)", nameBn: "পশ্চিম কার পার্কিং বে (৩ কার)", kind: "living", boundsRel: [0.05, 0.20, 0.30, 0.95], open: true },
      { id: "g_parking_r", nameEn: "East Parking Bays (3 Cars)", nameBn: "পূর্ব কার পার্কিং বে (৩ কার)", kind: "living", boundsRel: [0.70, 0.20, 0.95, 0.95], open: true },
      { id: "g_guard", nameEn: "Guard Post & Caretaker Suite", nameBn: "গার্ড রুম ও সাব-স্টেশন", kind: "bedroom", boundsRel: [0.05, 0.05, 0.30, 0.20], doorSide: "front", windowSide: "left" },
      { id: "g_bath", nameEn: "Drivers Bath", nameBn: "ড্রাইভার্স টয়লেট", kind: "bath", boundsRel: [0.70, 0.05, 0.95, 0.20], doorSide: "front", windowSide: "right" },
    ],
  },
  {
    id: "preset-triple-rental",
    nameEn: "Type C: Triple Rental Flats (3 Units / Floor)",
    nameBn: "টাইপ সি: তিন ইউনিট (প্রতিটিতে ২ বেড, ২ বাথ, ১ বারান্দা)",
    unitsCount: 3,
    suitablePlotKatha: "4.5 – 6.5 Katha",
    descriptionEn: "High yield rental building plan for Dhaka/Chittagong. 3 Compact flats per floor with central elevator & staircase core.",
    descriptionBn: "সর্বোচ্চ ভাড়া আয়ের জন্য ঢাকা/চট্টগ্রামের উপযোগী ৩ ইউনিট বিন্যাস। প্রতিটি ইউনিটে ২টি বেডরুম, ২টি বাথরুম ও বারান্দা।",
    rooms: [
      { id: "uA_bed1", nameEn: "Unit A Master Bed", nameBn: "ইউনিট এ মাস্টার বেড", kind: "bedroom", boundsRel: [0.05, 0.60, 0.35, 0.95], doorSide: "rear", windowSide: "left" },
      { id: "uA_bed2", nameEn: "Unit A Bed 2", nameBn: "ইউনিট এ বেড ২", kind: "bedroom", boundsRel: [0.05, 0.35, 0.35, 0.60], doorSide: "right", windowSide: "left" },
      { id: "uA_living", nameEn: "Unit A Living/Dining", nameBn: "ইউনিট এ ড্রয়িং-ডাইনিং", kind: "living", boundsRel: [0.35, 0.50, 0.50, 0.95], doorSide: "left", windowSide: "front" },
      { id: "uA_kitchen", nameEn: "Unit A Kitchen", nameBn: "ইউনিট এ রান্নাঘর", kind: "kitchen", boundsRel: [0.35, 0.35, 0.50, 0.50], doorSide: "left", windowSide: "front" },
      { id: "uB_bed1", nameEn: "Unit B Master Bed", nameBn: "ইউনিট বি মাস্টার বেড", kind: "bedroom", boundsRel: [0.65, 0.60, 0.95, 0.95], doorSide: "rear", windowSide: "right" },
      { id: "uB_bed2", nameEn: "Unit B Bed 2", nameBn: "ইউনিট বি বেড ২", kind: "bedroom", boundsRel: [0.65, 0.35, 0.95, 0.60], doorSide: "left", windowSide: "right" },
      { id: "uB_living", nameEn: "Unit B Living/Dining", nameBn: "ইউনিট বি ড্রয়িং-ডাইনিং", kind: "living", boundsRel: [0.50, 0.50, 0.65, 0.95], doorSide: "right", windowSide: "front" },
      { id: "uC_bed1", nameEn: "Unit C Master Bed", nameBn: "ইউনিট সি মাস্টার বেড", kind: "bedroom", boundsRel: [0.05, 0.05, 0.35, 0.30], doorSide: "front", windowSide: "rear" },
      { id: "uC_living", nameEn: "Unit C Living/Dining", nameBn: "ইউনিট সি ড্রয়িং-ডাইনিং", kind: "living", boundsRel: [0.65, 0.05, 0.95, 0.30], doorSide: "left", windowSide: "rear" },
    ],
  },
  {
    id: "preset-duplex-courtyard",
    nameEn: "Type D: Duplex Villa with Open Courtyard & Double-Height Lounge",
    nameBn: "টাইপ ডি: খোলা উঠোন ও ডাবল-হাইটের উঠান সংবলিত ডুপ্লেক্স ভিলা",
    unitsCount: 1,
    suitablePlotKatha: "3.0 – 5.0 Katha",
    descriptionEn: "Private duplex villa plan featuring central open courtyard (Aangina), double-height family lounge, glass bridge walkway, and garden deck.",
    descriptionBn: "সেন্ট্রাল ওপেন কোর্টইয়ার্ড (আঙিনা), ডাবল-হাইট ফ্যামিলি লাউঞ্জ ও আধুনিক ডুপ্লেক্স সিঁড়ি সংবলিত অভিজাত ডুপ্লেক্স প্ল্যান।",
    rooms: [
      { id: "dup_master", nameEn: "Master Suite", nameBn: "মাস্টার সুইট", kind: "bedroom", boundsRel: [0.05, 0.60, 0.45, 0.95], doorSide: "rear", windowSide: "front" },
      { id: "dup_courtyard", nameEn: "Central Open Courtyard (Aangina)", nameBn: "সেন্ট্রাল খোলা আঙিনা", kind: "corridor", boundsRel: [0.45, 0.35, 0.65, 0.65], open: true },
      { id: "dup_lounge", nameEn: "Double-Height Family Lounge", nameBn: "ডাবল-হাইট ফ্যামিলি লাউঞ্জ", kind: "living", boundsRel: [0.05, 0.15, 0.45, 0.50], doorSide: "right", windowSide: "front" },
      { id: "dup_dining", nameEn: "Formal Dining & Bar", nameBn: "ফরমাল ডাইনিং", kind: "dining", boundsRel: [0.65, 0.15, 0.95, 0.50], doorSide: "left", windowSide: "rear" },
      { id: "dup_kitchen", nameEn: "Island Chef Kitchen", nameBn: "আইল্যান্ড কিচেন", kind: "kitchen", boundsRel: [0.65, 0.55, 0.95, 0.85], doorSide: "left", windowSide: "right" },
    ],
  },
  {
    id: "preset-studio-bachelor",
    nameEn: "Type E: Studio & 1-Bed Bachelor Apartments (4 Units / Floor)",
    nameBn: "টাইপ ই: স্টুডিও ও ১-বেড ব্যাচেলর অ্যাপার্টমেন্ট (৪ ইউনিট/তলা)",
    unitsCount: 4,
    suitablePlotKatha: "3.5 – 5.5 Katha",
    descriptionEn: "Compact high-density studio layout ideal for University/Commercial zones (Farmgate/Uttara). 4 Independent units per floor.",
    descriptionBn: "ফার্মগেট/উত্তরা অঞ্চলের জন্য উপযোগী ৪ ইউনিটের স্টুডিও প্ল্যান। প্রতিটি ইউনিটে ১ বেড, ১ বাথ, কিচেনেট ও বারান্দা।",
    rooms: [
      { id: "stA_bed", nameEn: "Studio A Living & Bed", nameBn: "স্টুডিও এ বেডরুম", kind: "bedroom", boundsRel: [0.05, 0.55, 0.40, 0.95], doorSide: "rear", windowSide: "left" },
      { id: "stB_bed", nameEn: "Studio B Living & Bed", nameBn: "স্টুডিও বি বেডরুম", kind: "bedroom", boundsRel: [0.60, 0.55, 0.95, 0.95], doorSide: "rear", windowSide: "right" },
      { id: "stC_bed", nameEn: "Studio C Living & Bed", nameBn: "স্টুডিও সি বেডরুম", kind: "bedroom", boundsRel: [0.05, 0.05, 0.40, 0.45], doorSide: "front", windowSide: "left" },
      { id: "stD_bed", nameEn: "Studio D Living & Bed", nameBn: "স্টুডিও ডি বেডরুম", kind: "bedroom", boundsRel: [0.60, 0.05, 0.95, 0.45], doorSide: "front", windowSide: "right" },
      { id: "st_lobby", nameEn: "Central Lift & Stair Lobby", nameBn: "সেন্ট্রাল লিফট ও সিঁড়ি লবি", kind: "stair", boundsRel: [0.40, 0.35, 0.60, 0.65], doorSide: "front", windowSide: "rear" },
    ],
  },
  {
    id: "preset-commercial-mixed",
    nameEn: "Type F: Commercial Showroom & Residential Mixed Tower",
    nameBn: "টাইপ এফ: কমার্শিয়াল শোরুম ও আবাসিক মিক্সড টাওয়ার",
    unitsCount: 2,
    suitablePlotKatha: "4.5 – 7.0 Katha",
    descriptionEn: "Main road frontage layout: Open-plan commercial display showroom on lower floors, luxury apartments above.",
    descriptionBn: "প্রধান সড়ক সংলগ্ন মিক্সড প্ল্যান: নিচের তলায় শোরুম/ব্যাংক এবং ওপরের তলাগুলোতে ৩ বেডরুমের ফ্যামিলি ফ্ল্যাট।",
    rooms: [
      { id: "comm_hall", nameEn: "Open Display Showroom Hall", nameBn: "ওপেন ডিসপ্লে শোরুম হল", kind: "living", boundsRel: [0.05, 0.10, 0.95, 1.00], pointsRel: [[0.05, 0.10], [0.70, 0.10], [0.70, 0.40], [0.95, 0.40], [0.95, 1.0], [0.05, 1.0]], doorSide: "front", windowSide: "front" },
      { id: "comm_stair", nameEn: "Commercial Fire Escape Stair", nameBn: "কমার্শিয়াল সিঁড়ি ও লিফট", kind: "stair", boundsRel: [0.70, 0.10, 0.95, 0.40], doorSide: "left", windowSide: "right" },
    ],
  },
  {
    id: "preset-family-duplex",
    nameEn: "Type G: Joint Family Building with Prayer/Namaz Suite",
    nameBn: "টাইপ জি: যৌথ পরিবারের জন্য সুপরিসর ফ্ল্যাট ও প্রার্থনা কক্ষ",
    unitsCount: 1,
    suitablePlotKatha: "3.5 – 5.5 Katha",
    descriptionEn: "Tailored for Bangladeshi joint families. Includes dedicated Namaz Room / Prayer Alcove, Wash Basin Nook, and Large Dining.",
    descriptionBn: "যৌথ পরিবারের ঐতিহ্যবাহী বিন্যাস: ডেডিকেটেড নামাজ ঘর/প্রার্থনা কক্ষ, আলাদা ডাইনিং ওয়াস বেসিন নুক ও ৫টি রুম।",
    rooms: [
      { id: "fam_master", nameEn: "Elders Master Suite", nameBn: "অভিভাবক মাস্টার সুইট", kind: "bedroom", boundsRel: [0.05, 0.60, 0.45, 0.95], doorSide: "rear", windowSide: "front" },
      { id: "fam_namaz", nameEn: "Dedicated Prayer/Namaz Room", nameBn: "নামাজ ঘর / প্রার্থনা কক্ষ", kind: "living", boundsRel: [0.45, 0.60, 0.65, 0.80], doorSide: "left", windowSide: "front" },
      { id: "fam_bed2", nameEn: "Children Bedroom", nameBn: "সন্তানদের রুম", kind: "bedroom", boundsRel: [0.65, 0.60, 0.95, 0.95], doorSide: "left", windowSide: "right" },
      { id: "fam_dining", nameEn: "12-Seater Grand Family Dining", nameBn: "১২-আসনবিশিষ্ট ডাইনিং হল", kind: "dining", boundsRel: [0.25, 0.15, 0.75, 0.45], doorSide: "front", windowSide: "rear" },
    ],
  },
  {
    id: "preset-penthouse-luxury",
    nameEn: "Type H: Grand Duplex Penthouse with Rooftop Sky Pool",
    nameBn: "টাইপ এইচ: রূফটপ স্কাই পুল সংবলিত গ্র্যান্ড ডুপ্লেক্স পেপেন্টহাউস",
    unitsCount: 1,
    suitablePlotKatha: "5.0 – 8.0 Katha",
    descriptionEn: "Top floor elite residence: Private rooftop swimming pool deck, outdoor barbecue pavilion, master suite with jacuzzi.",
    descriptionBn: "অভিজাত পেপেন্টহাউস: প্রাইভেট রূফটপ সুইমিং পুল, আউটডোর বারবিকেল প্যাভিলিয়ন ও মাস্টার সুইট উইথ জ্যাকুজি।",
    rooms: [
      { id: "pent_master", nameEn: "Penthouse Master Suite & Jacuzzi", nameBn: "পেপেন্টহাউস মাস্টার সুইট", kind: "bedroom", boundsRel: [0.05, 0.50, 0.50, 0.95], doorSide: "rear", windowSide: "front" },
      { id: "pent_pool", nameEn: "Private Rooftop Sky Pool Deck", nameBn: "প্রাইভেট স্কাই সুইমিং পুল", kind: "living", boundsRel: [0.55, 0.50, 0.95, 0.95], doorSide: "left", windowSide: "right", open: true },
      { id: "pent_lounge", nameEn: "Panoramic Glass Lounge", nameBn: "প্যানোরামিক গ্লাস লাউঞ্জ", kind: "living", boundsRel: [0.15, 0.05, 0.85, 0.45], doorSide: "front", windowSide: "rear" },
    ],
  },
  {
    id: "preset-narrow-duct",
    nameEn: "Type I: Narrow Plot Plan with Central Ventilation Airshaft Duct",
    nameBn: "টাইপ আই: সরু প্ল্যান (সেন্ট্রাল এয়ারশ্যাফ্ট ডাঙ্কট সহ)",
    unitsCount: 2,
    suitablePlotKatha: "2.5 – 3.8 Katha",
    descriptionEn: "Engineered for narrow Old Dhaka / Lalbagh plots (25ft x 80ft). Includes central BNBC compliant airshaft duct for 100% cross ventilation.",
    descriptionBn: "পুরান ঢাকা/লালবাগ এর সরু প্লটের (২৫x৮০ ফুট) জন্য উপযোগী বিন্যাস। ১০০% পর্যাপ্ত আলো-বাতাসের জন্য সেন্ট্রাল ডাঙ্কট সহ।",
    rooms: [
      { id: "nar_front", nameEn: "Front Flat Master Bed", nameBn: "সামনের মাস্টার বেড", kind: "bedroom", boundsRel: [0.05, 0.70, 0.95, 0.95], doorSide: "rear", windowSide: "front" },
      { id: "nar_duct", nameEn: "Central BNBC Airshaft Ventilation Duct", nameBn: "সেন্ট্রাল এয়ারশ্যাফ্ট ডাঙ্কট", kind: "corridor", boundsRel: [0.35, 0.40, 0.65, 0.60], open: true },
      { id: "nar_rear", nameEn: "Rear Flat Master Bed", nameBn: "পেছনের মাস্টার বেড", kind: "bedroom", boundsRel: [0.05, 0.05, 0.95, 0.30], doorSide: "front", windowSide: "rear" },
    ],
  },
  {
    id: "preset-architect-villa",
    nameEn: "Type J: Architect Villa — L-Shaped Living, Stepped Wing & Balcony Notch",
    nameBn: "টাইপ জে: আর্কিটেক্ট ভিলা — এল-আকৃতি লিভিং, ধাপ-করা ওয়িং ও বারান্দা নোট",
    unitsCount: 1,
    suitablePlotKatha: "3.0 – 5.0 Katha",
    descriptionEn: "v2.3 non-rectangular floorplan: L-shaped living/dining with an open balcony notch, a stepped (stair-step) master wing, and a glass-sliding balcony. Tests the polygon wall synthesis.",
    descriptionBn: "২৩-বিশিষ্ট অ-আয়তকার প্ল্যান: এল-আকৃতি লিভিং-ডাইনিং, ধাপ-করা মাস্টার ওয়িং ও গ্লাস বারান্দা। পলিগন সিঁড়ি সংক্রান্ত বিন্যাস পরীক্ষা করে।",
    rooms: [
      // L-shaped living/dining with a balcony notch cut out of the front-right corner
      {
        id: "v_living", nameEn: "L-Shaped Living & Dining", nameBn: "এল-আকৃতি লিভিং-ডাইনিং", kind: "living",
        boundsRel: [0.45, 0.50, 0.95, 0.95],
        pointsRel: [[0.45, 0.50], [0.95, 0.50], [0.95, 0.70], [0.75, 0.70], [0.75, 0.95], [0.45, 0.95]],
        doorSide: "inner", windowSide: "front",
      },
      // Balcony notch fills the front-right cut-out
      {
        id: "v_balcony", nameEn: "Open Balcony Notch", nameBn: "খোলা বারান্দা নোট", kind: "balcony",
        boundsRel: [0.75, 0.70, 0.95, 0.95], doorSide: "left", windowSide: "front",
      },
      // Stepped master suite wing (stair-step rear edge)
      {
        id: "v_master", nameEn: "Stepped Master Suite", nameBn: "ধাপ-করা মাস্টার সুইট", kind: "bedroom",
        boundsRel: [0.05, 0.60, 0.45, 0.95],
        pointsRel: [[0.05, 0.60], [0.45, 0.60], [0.45, 0.80], [0.32, 0.80], [0.32, 0.95], [0.05, 0.95]],
        doorSide: "right", windowSide: "front",
      },
      { id: "v_kitchen", nameEn: "Chef Kitchen", nameBn: "রান্নাঘর", kind: "kitchen", boundsRel: [0.05, 0.45, 0.32, 0.60], doorSide: "right", windowSide: "left" },
      { id: "v_dining", nameEn: "Formal Dining", nameBn: "ফরমাল ডাইনিং", kind: "dining", boundsRel: [0.45, 0.25, 0.95, 0.50], doorSide: "left", windowSide: "right" },
      { id: "v_bath1", nameEn: "Master Bath", nameBn: "মাস্টার বাথ", kind: "bath", boundsRel: [0.05, 0.25, 0.30, 0.40], doorSide: "right", windowSide: "left" },
      { id: "v_stair", nameEn: "Stair & Lift Core", nameBn: "সিঁড়ি ও লিফট লবি", kind: "stair", boundsRel: [0.05, 0.05, 0.30, 0.25], doorSide: "right", windowSide: "rear" },
      { id: "v_study", nameEn: "Study / Guest Room", nameBn: "স্টাডি / অতিথি রুম", kind: "bedroom", boundsRel: [0.30, 0.05, 0.55, 0.25], doorSide: "left", windowSide: "rear" },
    ],
  },
];

/**
 * Presets leave a ~5 % margin between rooms and the facade (and 0.95 against the far side). The
 * generator builds a full-span exterior envelope, so a room that stops 0.5 m short of it gets no
 * exterior wall of its own (its windows were dropped as "interior") and a dead strip appears
 * behind the facade. Coordinates within `tol` of 0 or 1 are snapped onto the envelope.
 */
export function snapRoomsToEnvelope(rooms: RoomPartition[], tol = 0.06): RoomPartition[] {
  const snap = (v: number) => (v <= tol ? 0 : v >= 1 - tol ? 1 : v);
  return rooms.map((r) => ({
    ...r,
    boundsRel: r.boundsRel.map(snap) as RoomPartition["boundsRel"],
    ...(r.pointsRel ? { pointsRel: r.pointsRel.map(([x, y]) => [snap(x), snap(y)] as [number, number]) } : {}),
  }));
}
