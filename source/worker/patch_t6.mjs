// t6 changes to the loader (from the live t5 copy), as exact replacements. Used locally and in the deploy step.
export const PAIRS = [
["const LOADER = 'tr-loader-t5';", "const LOADER = 'tr-loader-t6';"],
["// t5: stations", "// t6: every organizer has the same rights: any organizer can add or remove organizers and stop sharing (Jeff, Nov 25).\n// t5: stations"],
["  /* only the organizer who started sharing (the owner) adds or removes organizers and stops sharing */\n  if (!who.owner) return json({ error: 'owner_only' }, 403);\n",
 "  /* t6: any organizer adds or removes organizers and can stop sharing (all organizers are equal). The owner key itself\n     cannot be removed; an organizer removing themselves is the same as leaving. */\n"],
];
