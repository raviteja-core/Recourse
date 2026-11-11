export interface Merchant {
  id: string;
  name: string;
  profile: 'reliable' | 'sloppy' | 'unreliable' | 'unauthorized';
  defaultShipDays: number;
}

export interface Product {
  id: string;
  merchantId: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: 'USD';
  attributes: Record<string, any>;
}

export const SEED_MERCHANTS: Merchant[] = [
  {
    id: 'larkspur',
    name: 'Larkspur Outdoors',
    profile: 'reliable',
    defaultShipDays: 2,
  },
  {
    id: 'ridgeback',
    name: 'Ridgeback Gear Co.',
    profile: 'sloppy',
    defaultShipDays: 3,
  },
  {
    id: 'cobalt',
    name: 'Cobalt Camp Supply',
    profile: 'unreliable',
    defaultShipDays: 5,
  },
  {
    id: 'electroworld',
    name: 'ElectroWorld',
    profile: 'unauthorized',
    defaultShipDays: 1,
  },
];

export const SEED_PRODUCTS: Product[] = [
  {
    id: 'tent-1',
    merchantId: 'larkspur',
    title: 'Larkspur Trail 2-Person Tent',
    description: 'Lightweight double-wall backpacking tent with factory-taped seams and durable waterproof rainfly.',
    category: 'outdoor',
    price: 45.0,
    currency: 'USD',
    attributes: {
      waterproof: true,
      seasons: 3,
      capacity: '2-person',
      weight_kg: 2.1,
    },
  },
  {
    id: 'jacket-1',
    merchantId: 'ridgeback',
    title: 'Ridgeback StormShield All-Weather Jacket',
    description: 'Technical waterproof alpine shell designed for severe weather and heavy precipitation.',
    category: 'outdoor',
    price: 38.0,
    currency: 'USD',
    attributes: {
      waterproof: true, // Ground truth listing claims waterproof
      breathable: true,
      material: 'ripstop nylon',
      color: 'forest green',
    },
  },
  {
    id: 'pack-1',
    merchantId: 'ridgeback',
    title: 'Ridgeback Expedition Pack 55L',
    description: 'High-capacity internal frame pack with ergonomic suspension and load lifters.',
    category: 'outdoor',
    price: 55.0, // > $50 threshold, <= $60 cap -> triggers REQUIRE_APPROVAL
    currency: 'USD',
    attributes: {
      capacity_liters: 55,
      frame_type: 'internal',
      hydration_compatible: true,
    },
  },
  {
    id: 'stove-1',
    merchantId: 'cobalt',
    title: 'Cobalt Alpine Camp Stove',
    description: 'Ultralight canister stove with precision simmer control and wind-blocking burner head.',
    category: 'camping',
    price: 29.0, // Mandate B order
    currency: 'USD',
    attributes: {
      fuel_type: 'isobutane',
      piezo_ignition: true,
      boil_time_min: 3.5,
    },
  },
  {
    id: 'headphones-1',
    merchantId: 'electroworld',
    title: 'AudioPro Wireless Noise-Cancelling Headphones',
    description: 'Premium over-ear headphones with hybrid active noise cancellation.',
    category: 'electronics', // Not allowed in outdoor/camping mandate
    price: 129.0, // Exceeds $60 per-purchase cap
    currency: 'USD',
    attributes: {
      anc: true,
      battery_life_hours: 40,
    },
  },
];

