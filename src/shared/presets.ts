// SlotSync Industry Presets & Seed Templates

export interface PresetServiceTemplate {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_minor: number; // in paise (e.g. 35000 = ₹350)
  currency: string;
}

export interface IndustryPresetDefinition {
  id: string;
  name: string;
  description: string;
  iconName: string;
  services: PresetServiceTemplate[];
  fieldSuggestions: {
    addressHint: string;
    noticeHours: number;
    cancellationPolicy: string;
  };
}

export const INDUSTRY_PRESETS: Record<string, IndustryPresetDefinition> = {
  salon: {
    id: 'salon',
    name: 'Salon & Barber',
    description: 'Haircuts, styling, grooming, and spa treatments',
    iconName: 'Scissors',
    services: [
      {
        name: "Men's Classic Haircut",
        description: 'Consultation, precision cut, wash, and style.',
        duration_minutes: 30,
        buffer_minutes: 10,
        price_minor: 35000, // ₹350
        currency: 'INR',
      },
      {
        name: "Women's Styling & Cut",
        description: 'Shampoo, layered cut, blow-dry finish, and serum.',
        duration_minutes: 60,
        buffer_minutes: 15,
        price_minor: 85000, // ₹850
        currency: 'INR',
      },
      {
        name: 'Beard Trim & Hot Towel Grooming',
        description: 'Shape-up, razor detailing, and soothing hot towel.',
        duration_minutes: 20,
        buffer_minutes: 5,
        price_minor: 20000, // ₹200
        currency: 'INR',
      },
      {
        name: 'Deep Conditioning Hair Spa',
        description: 'Intense steam therapy, head massage, and damage repair.',
        duration_minutes: 45,
        buffer_minutes: 15,
        price_minor: 120000, // ₹1200
        currency: 'INR',
      },
    ],
    fieldSuggestions: {
      addressHint: 'Shop #12, 1st Floor, High Street Mall',
      noticeHours: 2,
      cancellationPolicy: 'Free cancellation up to 2 hours before appointment.',
    },
  },
  clinic: {
    id: 'clinic',
    name: 'Healthcare & Clinic',
    description: 'Doctor consultations, dental checkups, and therapies',
    iconName: 'Activity',
    services: [
      {
        name: 'Initial Consultation',
        description: 'Comprehensive health review and assessment.',
        duration_minutes: 30,
        buffer_minutes: 10,
        price_minor: 60000, // ₹600
        currency: 'INR',
      },
      {
        name: 'Follow-up Checkup',
        description: 'Progress assessment and prescription review.',
        duration_minutes: 15,
        buffer_minutes: 5,
        price_minor: 30000, // ₹300
        currency: 'INR',
      },
    ],
    fieldSuggestions: {
      addressHint: 'Room 204, MedCenter Complex',
      noticeHours: 4,
      cancellationPolicy: 'Please give at least 4 hours notice for cancellations.',
    },
  },
  tutor: {
    id: 'tutor',
    name: 'Tutor & Coaching',
    description: '1-on-1 tutoring, skill lessons, and music coaching',
    iconName: 'BookOpen',
    services: [
      {
        name: '1-on-1 Coaching Session',
        description: 'Private 60-minute subject coaching.',
        duration_minutes: 60,
        buffer_minutes: 15,
        price_minor: 100000, // ₹1000
        currency: 'INR',
      },
    ],
    fieldSuggestions: {
      addressHint: 'Online via Google Meet or Studio #4',
      noticeHours: 12,
      cancellationPolicy: 'Cancellations within 12 hours may forfeit lesson credit.',
    },
  },
};
