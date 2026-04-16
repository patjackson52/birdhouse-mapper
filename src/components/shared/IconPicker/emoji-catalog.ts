// src/components/shared/IconPicker/emoji-catalog.ts

export interface EmojiEntry {
  emoji: string;
  name: string;
  searchTerms: string;
  category: string;
}

export interface EmojiCategory {
  name: string;
  entries: EmojiEntry[];
}

const ANIMALS: EmojiEntry[] = [
  { emoji: '🐦', name: 'Bird', searchTerms: 'bird', category: 'Animals' },
  { emoji: '🦅', name: 'Eagle', searchTerms: 'eagle bird raptor', category: 'Animals' },
  { emoji: '🦆', name: 'Duck', searchTerms: 'duck bird waterfowl', category: 'Animals' },
  { emoji: '🦉', name: 'Owl', searchTerms: 'owl bird raptor nocturnal', category: 'Animals' },
  { emoji: '🐟', name: 'Fish', searchTerms: 'fish aquatic', category: 'Animals' },
  { emoji: '🐠', name: 'Tropical Fish', searchTerms: 'tropical fish aquatic', category: 'Animals' },
  { emoji: '🦎', name: 'Lizard', searchTerms: 'lizard reptile', category: 'Animals' },
  { emoji: '🐍', name: 'Snake', searchTerms: 'snake reptile', category: 'Animals' },
  { emoji: '🐢', name: 'Turtle', searchTerms: 'turtle reptile', category: 'Animals' },
  { emoji: '🐸', name: 'Frog', searchTerms: 'frog amphibian', category: 'Animals' },
  { emoji: '🦋', name: 'Butterfly', searchTerms: 'butterfly insect', category: 'Animals' },
  { emoji: '🐝', name: 'Bee', searchTerms: 'bee honeybee insect pollinator', category: 'Animals' },
  { emoji: '🐞', name: 'Ladybug', searchTerms: 'ladybug ladybird insect beetle', category: 'Animals' },
  { emoji: '🦌', name: 'Deer', searchTerms: 'deer mammal', category: 'Animals' },
  { emoji: '🐿️', name: 'Squirrel', searchTerms: 'squirrel chipmunk mammal', category: 'Animals' },
  { emoji: '🐇', name: 'Rabbit', searchTerms: 'rabbit bunny mammal', category: 'Animals' },
  { emoji: '🦡', name: 'Badger', searchTerms: 'badger mammal', category: 'Animals' },
  { emoji: '🐻', name: 'Bear', searchTerms: 'bear mammal', category: 'Animals' },
  { emoji: '🐺', name: 'Wolf', searchTerms: 'wolf mammal canine', category: 'Animals' },
  { emoji: '🦊', name: 'Fox', searchTerms: 'fox mammal canine', category: 'Animals' },
];

const PLANTS: EmojiEntry[] = [
  { emoji: '🌲', name: 'Evergreen', searchTerms: 'evergreen tree pine conifer', category: 'Plants' },
  { emoji: '🌳', name: 'Deciduous Tree', searchTerms: 'deciduous tree oak', category: 'Plants' },
  { emoji: '🌴', name: 'Palm Tree', searchTerms: 'palm tree tropical', category: 'Plants' },
  { emoji: '🌵', name: 'Cactus', searchTerms: 'cactus desert succulent', category: 'Plants' },
  { emoji: '🌿', name: 'Herb', searchTerms: 'herb fern green plant', category: 'Plants' },
  { emoji: '🍀', name: 'Clover', searchTerms: 'clover shamrock four leaf', category: 'Plants' },
  { emoji: '🌱', name: 'Seedling', searchTerms: 'seedling sprout grow plant', category: 'Plants' },
  { emoji: '🌾', name: 'Rice', searchTerms: 'rice grain wheat crop', category: 'Plants' },
  { emoji: '🌻', name: 'Sunflower', searchTerms: 'sunflower flower', category: 'Plants' },
  { emoji: '🌺', name: 'Hibiscus', searchTerms: 'hibiscus flower tropical', category: 'Plants' },
  { emoji: '🌸', name: 'Cherry Blossom', searchTerms: 'cherry blossom flower spring', category: 'Plants' },
  { emoji: '🍄', name: 'Mushroom', searchTerms: 'mushroom fungi fungus', category: 'Plants' },
  { emoji: '🪴', name: 'Potted Plant', searchTerms: 'potted plant houseplant', category: 'Plants' },
  { emoji: '🎋', name: 'Bamboo', searchTerms: 'bamboo tanabata', category: 'Plants' },
  { emoji: '🎍', name: 'Pine Decoration', searchTerms: 'pine decoration kadomatsu', category: 'Plants' },
];

const NATURE: EmojiEntry[] = [
  { emoji: '🏔️', name: 'Mountain', searchTerms: 'mountain snow peak', category: 'Nature' },
  { emoji: '⛰️', name: 'Mountain', searchTerms: 'mountain hill', category: 'Nature' },
  { emoji: '🌊', name: 'Wave', searchTerms: 'wave ocean water sea', category: 'Nature' },
  { emoji: '💧', name: 'Droplet', searchTerms: 'droplet water rain', category: 'Nature' },
  { emoji: '🏖️', name: 'Beach', searchTerms: 'beach umbrella sand coast', category: 'Nature' },
  { emoji: '🏕️', name: 'Campsite', searchTerms: 'campsite camping tent outdoors', category: 'Nature' },
  { emoji: '🌅', name: 'Sunrise', searchTerms: 'sunrise dawn morning', category: 'Nature' },
  { emoji: '🌄', name: 'Sunrise Mountains', searchTerms: 'sunrise mountains dawn', category: 'Nature' },
  { emoji: '☀️', name: 'Sun', searchTerms: 'sun sunny weather', category: 'Nature' },
  { emoji: '🌧️', name: 'Rain', searchTerms: 'rain cloud weather', category: 'Nature' },
  { emoji: '❄️', name: 'Snowflake', searchTerms: 'snowflake snow cold winter', category: 'Nature' },
  { emoji: '🔥', name: 'Fire', searchTerms: 'fire flame burn', category: 'Nature' },
  { emoji: '🌍', name: 'Globe', searchTerms: 'globe earth world africa europe', category: 'Nature' },
  { emoji: '🗺️', name: 'Map', searchTerms: 'map world atlas', category: 'Nature' },
  { emoji: '🧭', name: 'Compass', searchTerms: 'compass navigation direction', category: 'Nature' },
];

const TOOLS: EmojiEntry[] = [
  { emoji: '🔭', name: 'Telescope', searchTerms: 'telescope astronomy observe', category: 'Tools' },
  { emoji: '📷', name: 'Camera', searchTerms: 'camera photo picture', category: 'Tools' },
  { emoji: '🔬', name: 'Microscope', searchTerms: 'microscope science lab', category: 'Tools' },
  { emoji: '🪣', name: 'Bucket', searchTerms: 'bucket pail', category: 'Tools' },
  { emoji: '🪜', name: 'Ladder', searchTerms: 'ladder climb', category: 'Tools' },
  { emoji: '🔧', name: 'Wrench', searchTerms: 'wrench spanner tool', category: 'Tools' },
  { emoji: '📋', name: 'Clipboard', searchTerms: 'clipboard checklist list', category: 'Tools' },
  { emoji: '📝', name: 'Memo', searchTerms: 'memo note pencil write', category: 'Tools' },
  { emoji: '📌', name: 'Pushpin', searchTerms: 'pushpin pin location', category: 'Tools' },
  { emoji: '📍', name: 'Pin', searchTerms: 'pin location map marker', category: 'Tools' },
  { emoji: '🏷️', name: 'Label', searchTerms: 'label tag', category: 'Tools' },
  { emoji: '🚜', name: 'Tractor', searchTerms: 'tractor farm vehicle', category: 'Tools' },
  { emoji: '🛶', name: 'Canoe', searchTerms: 'canoe kayak boat paddle', category: 'Tools' },
  { emoji: '🚙', name: 'SUV', searchTerms: 'suv car vehicle truck', category: 'Tools' },
  { emoji: '✂️', name: 'Scissors', searchTerms: 'scissors cut trim', category: 'Tools' },
];

const GENERAL: EmojiEntry[] = [
  { emoji: '⭐', name: 'Star', searchTerms: 'star favorite', category: 'General' },
  { emoji: '❤️', name: 'Heart', searchTerms: 'heart love red', category: 'General' },
  { emoji: '✅', name: 'Check', searchTerms: 'check done complete', category: 'General' },
  { emoji: '⚠️', name: 'Warning', searchTerms: 'warning alert caution', category: 'General' },
  { emoji: '🏠', name: 'House', searchTerms: 'house home building', category: 'General' },
  { emoji: '🚩', name: 'Flag', searchTerms: 'flag marker', category: 'General' },
  { emoji: '🎯', name: 'Target', searchTerms: 'target bullseye goal', category: 'General' },
  { emoji: '💡', name: 'Light Bulb', searchTerms: 'light bulb idea', category: 'General' },
  { emoji: '🔔', name: 'Bell', searchTerms: 'bell notification alert', category: 'General' },
  { emoji: '📊', name: 'Chart', searchTerms: 'chart bar graph data', category: 'General' },
  { emoji: '📁', name: 'Folder', searchTerms: 'folder file directory', category: 'General' },
  { emoji: '🗓️', name: 'Calendar', searchTerms: 'calendar date schedule', category: 'General' },
  { emoji: '👤', name: 'Person', searchTerms: 'person user silhouette', category: 'General' },
  { emoji: '👥', name: 'People', searchTerms: 'people group team users', category: 'General' },
  { emoji: '🏗️', name: 'Construction', searchTerms: 'construction building crane', category: 'General' },
];

const ALL_EMOJIS: EmojiEntry[] = [...ANIMALS, ...PLANTS, ...NATURE, ...TOOLS, ...GENERAL];

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { name: 'Animals', entries: ANIMALS },
  { name: 'Plants', entries: PLANTS },
  { name: 'Nature', entries: NATURE },
  { name: 'Tools', entries: TOOLS },
  { name: 'General', entries: GENERAL },
];

export function getAllEmojis(): EmojiEntry[] {
  return ALL_EMOJIS;
}

export function searchEmojis(query: string): EmojiEntry[] {
  const q = query.toLowerCase().trim();
  return ALL_EMOJIS.filter((e) => e.searchTerms.includes(q) || e.name.toLowerCase().includes(q));
}
