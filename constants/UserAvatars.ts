import { type PresetAvatar, getPresetAvatarUri } from './DriverLevels';

const user1  = require('../assets/avatars/male_1.png');
const user2  = require('../assets/avatars/male_2.png');
const user3  = require('../assets/avatars/male_3.png');
const user4  = require('../assets/avatars/male_4.png');
const user5  = require('../assets/avatars/male_5.png');
const user6  = require('../assets/avatars/male_6.png');
const user7  = require('../assets/avatars/male_screenshot_1.png');
const user8  = require('../assets/avatars/male_screenshot_2.png');
const user9  = require('../assets/avatars/male_screenshot_3.png');
const user10 = require('../assets/avatars/male_screenshot_4.png');
const user11 = require('../assets/avatars/male_screenshot_5.png');
const user12 = require('../assets/avatars/male_screenshot_6.png');
const user13 = require('../assets/avatars/male_screenshot_7.png');
const user14 = require('../assets/avatars/male_screenshot_8.png');
const user15 = require('../assets/avatars/male_screenshot_9.png');
const user16 = require('../assets/avatars/male_screenshot_10.png');
const user17 = require('../assets/avatars/male_screenshot_11.png');
const user18 = require('../assets/avatars/male_screenshot_12.png');
const user19 = require('../assets/avatars/male_screenshot_13.png');
const user20 = require('../assets/avatars/female_1.png');
const user21 = require('../assets/avatars/female_5.png');
const user22 = require('../assets/avatars/female_screenshot_1.png');
const user23 = require('../assets/avatars/female_screenshot_5.png');
const user24 = require('../assets/avatars/female_screenshot_6.png');
const user25 = require('../assets/avatars/female_screenshot_7.png');
const user26 = require('../assets/avatars/female_screenshot_9.png');

export type { PresetAvatar as UserAvatarPreset };

export const USER_2D_AVATARS: PresetAvatar[] = [
  { name: 'Fleet Manager',     seed: 'user-1',  image: user1  },
  { name: 'Road Pro',          seed: 'user-2',  image: user2  },
  { name: 'The Veteran',       seed: 'user-3',  image: user3  },
  { name: 'Tech Lead',         seed: 'user-4',  image: user4  },
  { name: 'The Dispatcher',    seed: 'user-5',  image: user5  },
  { name: 'Senior Manager',    seed: 'user-6',  image: user6  },
  { name: 'Operations Pro',    seed: 'user-7',  image: user7  },
  { name: 'Logistics Expert',  seed: 'user-8',  image: user8  },
  { name: 'Fleet Coordinator', seed: 'user-9',  image: user9  },
  { name: 'Route Planner',     seed: 'user-10', image: user10 },
  { name: 'Cargo Specialist',  seed: 'user-11', image: user11 },
  { name: 'Transport Lead',    seed: 'user-12', image: user12 },
  { name: 'Urban Driver',      seed: 'user-13', image: user13 },
  { name: 'Express Pilot',     seed: 'user-14', image: user14 },
  { name: 'Supply Chain Pro',  seed: 'user-15', image: user15 },
  { name: 'Dispatch Manager',  seed: 'user-16', image: user16 },
  { name: 'Field Operator',    seed: 'user-17', image: user17 },
  { name: 'Logistics Chief',   seed: 'user-18', image: user18 },
  { name: 'Hub Controller',    seed: 'user-19', image: user19 },
  { name: 'Fleet Coordinator', seed: 'user-20', image: user20 },
  { name: 'Office Manager',    seed: 'user-21', image: user21 },
  { name: 'Swift Sister',      seed: 'user-22', image: user22 },
  { name: 'The Navigator',     seed: 'user-23', image: user23 },
  { name: 'Fleet Analyst',     seed: 'user-24', image: user24 },
  { name: 'Logistics Pro',     seed: 'user-25', image: user25 },
  { name: 'Express Manager',   seed: 'user-26', image: user26 },
];

export const DEFAULT_USER_2D_AVATAR_SEED = USER_2D_AVATARS[0]?.seed ?? 'user-1';

export function getUser2DAvatarUriForSeed(seed: string): string {
  const preset = USER_2D_AVATARS.find((a) => a.seed === seed);
  return getPresetAvatarUri(preset ?? USER_2D_AVATARS[0]!);
}
