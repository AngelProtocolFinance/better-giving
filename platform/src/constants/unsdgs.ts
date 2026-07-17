import type { SDGGroup, UNSDG_NUMS } from "#/types/lists";

type UNSDG = {
  icon: string;
  title: string;
  desc: string;
  youtube: string;
  website: string;
};

export const unsdgs: { [index in UNSDG_NUMS]: UNSDG } = {
  1: {
    icon: "/icons/unsdg/no_poverty.webp",
    title: "No Poverty",
    desc: "End poverty in all its forms everywhere.",
    youtube: "https://www.youtube.com/watch?v=kNsLF9-9l5U",
    website: "https://sdgs.un.org/goals/goal1",
  },
  2: {
    icon: "/icons/unsdg/zero_hunger.webp",
    title: "Zero Hunger",
    desc: "End hunger, achieve food security and improved nutrition and promote sustainable agriculture.",
    youtube: "https://www.youtube.com/watch?v=j06rYbyD9lI",
    website: "https://sdgs.un.org/goals/goal2",
  },
  3: {
    icon: "/icons/unsdg/good_health.webp",
    title: "Good Health",
    desc: "Ensure healthy lives and promote well-being for all at all ages.",
    youtube: "https://www.youtube.com/watch?v=Fzz3Rr8fd2Q",
    website: "https://sdgs.un.org/goals/goal3",
  },
  4: {
    title: "Quality Education",
    desc: "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all.",
    icon: "/icons/unsdg/education.webp",
    youtube: "https://www.youtube.com/watch?v=dKip3rpuEvY",
    website: "https://sdgs.un.org/goals/goal4",
  },
  5: {
    title: "Gender Equality",
    desc: "Achieve gender equality and empower all women and girls.",
    icon: "/icons/unsdg/gender_equality.webp",
    youtube: "https://www.youtube.com/watch?v=MsbAETRE7b4",
    website: "https://sdgs.un.org/goals/goal5",
  },
  6: {
    title: "Clean Water",
    desc: "Ensure availability and sustainable management of water and sanitation for all.",
    icon: "/icons/unsdg/clean_water.webp",
    youtube: "https://www.youtube.com/watch?v=LCKsU4bPFOQ",
    website: "https://sdgs.un.org/goals/goal6",
  },
  7: {
    title: "Affordable and Clean Energy",
    desc: "Ensure access to affordable, reliable, sustainable and modern energy for all.",
    icon: "/icons/unsdg/energy.webp",
    youtube: "https://www.youtube.com/watch?v=AA9X39tFkgU",
    website: "https://sdgs.un.org/goals/goal7",
  },
  8: {
    title: "Decent Work and Economic Growth",
    desc: "Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all.",
    icon: "/icons/unsdg/decent_work.webp",
    youtube: "https://www.youtube.com/watch?v=E231k5qH-ac",
    website: "https://sdgs.un.org/goals/goal8",
  },
  9: {
    title: "Industry, Innovation and Infrastructure",
    desc: "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation.",
    icon: "/icons/unsdg/industry.webp",
    youtube: "https://www.youtube.com/watch?v=wCfNiGLTg-I",
    website: "https://sdgs.un.org/goals/goal9",
  },
  10: {
    title: "Reduced Inequalities",
    desc: "Reduce inequality within and among countries.",
    icon: "/icons/unsdg/inequalities.webp",
    youtube: "https://www.youtube.com/watch?v=P-xWg3WZUHw",
    website: "https://sdgs.un.org/goals/goal10",
  },
  11: {
    title: "Sustainable Cities and Communities",
    desc: "Make cities and human settlements inclusive, safe, resilient and sustainable.",
    icon: "/icons/unsdg/sustainable_communities.webp",
    youtube: "https://www.youtube.com/watch?v=RPoDircL5zc",
    website: "https://sdgs.un.org/goals/goal11",
  },
  12: {
    title: "Responsible Consumption and Production",
    desc: "Ensure sustainable consumption and production patterns.",
    icon: "/icons/unsdg/consumption.webp",
    youtube: "https://www.youtube.com/watch?v=RX2elsVjY-c",
    website: "https://sdgs.un.org/goals/goal12",
  },
  13: {
    title: "Climate Action",
    desc: "Take urgent action to combat climate change and its impacts.",
    icon: "/icons/unsdg/climate.webp",
    youtube: "https://www.youtube.com/watch?v=oSqmCNNV2dQ",
    website: "https://sdgs.un.org/goals/goal13",
  },
  14: {
    title: "Life Below Water",
    desc: "Conserve and sustainably use the oceans, seas and marine resources for sustainable development.",
    icon: "/icons/unsdg/life_water.webp",
    youtube: "https://www.youtube.com/watch?v=N3nnyj998BI",
    website: "https://sdgs.un.org/goals/goal14",
  },
  15: {
    title: "Life On Land",
    desc: "Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt and reverse land degradation and halt biodiversity loss.",
    icon: "/icons/unsdg/life_land.webp",
    youtube: "https://www.youtube.com/watch?v=N5YR2GMhYcI",
    website: "https://sdgs.un.org/goals/goal15",
  },
  16: {
    title: "Peace Justice and Strong Institutions",
    desc: "Promote peaceful and inclusive societies for sustainable development, provide access to justice for all and build effective, accountable and inclusive institutions at all levels.",
    icon: "/icons/unsdg/justice.webp",
    youtube: "https://www.youtube.com/watch?v=Ww_B0mvGiYc",
    website: "https://sdgs.un.org/goals/goal16",
  },
  17: {
    title: "Partnerships for the Goals",
    desc: "Strengthen the means of implementation and revitalize the global partnership for sustainable development.",
    icon: "/icons/unsdg/partnership.webp",
    youtube: "https://www.youtube.com/watch?v=iNybt97dnQ0",
    website: "https://sdgs.un.org/goals/goal17",
  },
};

export const categories: {
  [K in SDGGroup]: { name: string; sdgs: UNSDG_NUMS[] };
} = {
  1: {
    name: "Reducing overall inequality",
    sdgs: [1, 2, 3],
  },
  2: {
    name: "Access to safe conditions",
    sdgs: [3, 6, 7],
  },
  3: {
    name: "Sustainable growth",
    sdgs: [8, 9, 16],
  },
  4: {
    name: "Equality through education",
    sdgs: [4, 5],
  },
  5: {
    name: "Sustainable partnerships",
    sdgs: [11, 12, 17],
  },
  6: {
    name: "Holistic climate action",
    sdgs: [13, 14, 15],
  },
};

export const sdgGroups = Object.entries(categories).map(
  ([group, val]) => [+group, val.sdgs] as [SDGGroup, UNSDG_NUMS[]]
);
