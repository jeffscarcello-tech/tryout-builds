/* =====================================================================
   Score guides: what each score means, shown to evaluators while they score so coaches score alike.
   form.levels = { key, g: { value: text }, sample }   the guide for every skill
   skill.guide = { key, g: { value: text } }           a skill's own guide (wins over the general one)
   key = the scale it was written for (scale + '/' + lowest), so a guide never shows on a scale it does not fit.
   Works for scales with up to 11 choices (buttons); larger custom scales use the slider and have no guide.
   ===================================================================== */
const gkey = f => f.scale + '/' + scaleLo(f);
const guideFits = f => !useSlider(f);
const LEVELS = {
  '5/1': { 1: 'Not yet: rarely does it', 2: 'Learning: sometimes, with help', 3: 'Steady: does it most of the time', 4: 'Strong: consistent, even under pressure', 5: 'Standout: among the best here' },
  '10/1': { 1: 'Not yet', 2: 'Not yet, a few signs', 3: 'Learning', 4: 'Learning, getting closer', 5: 'Steady some of the time', 6: 'Steady most of the time', 7: 'Strong', 8: 'Strong and consistent', 9: 'Standout', 10: 'Best seen here' },
  'pcm/1': { 3: 'Above the level of this group', 2: 'At the level of this group', 1: 'Below the level of this group' }
};
/* sample guides for a few skills (1 to 5), matched by skill name; organizers edit or clear them */
const SAMPLE_SKILL_GUIDES = {
  volleyball: {
    Serving: ['Misses most serves', 'Gets some in, little control', 'Gets most in, can aim at zones', 'Consistent with pace or float, hits targets', 'Tough serve that scores or breaks passing'],
    Passing: ['Ball often goes off target or out', 'Playable sometimes', 'Mostly playable, to the 10-foot line', 'Consistently to target, good platform and footwork', 'Perfect passes on tough serves'],
    Setting: ['Hands not clean yet, ball often doubled', 'Gets the ball up, location varies', 'Hittable sets most of the time', 'Consistent location and tempo, runs plays', 'Sets every hitter well, from anywhere'],
    Attacking: ['Approach and contact not there yet', 'Gets the ball over, little power', 'Good approach, hits in most of the time', 'Hits with power and direction, few errors', 'Terminates, uses the block, hard to stop']
  },
  basketball: {
    'Ball handling': ['Loses the ball under little pressure', 'Handles with strong hand only', 'Both hands, keeps it under light pressure', 'Beats pressure, changes speed and direction', 'Breaks down defenders, never rattled'],
    Shooting: ['Form not there yet', 'Makes some close shots', 'Steady form, makes open mid-range', 'Makes shots off the catch and dribble', 'Scores from range, even when guarded']
  },
  hockey: {
    'Skating forward': ['Unsteady, short strides', 'Moves, but upright and slow', 'Good stride most of the time', 'Strong stride and quick starts', 'Explosive, among the fastest here'],
    'Puck control': ['Loses the puck when moving', 'Handles it standing or slow', 'Controls it at speed most of the time', 'Protects it and moves it under pressure', 'Makes plays through traffic']
  },
  ringette: {
    'Skating forward': ['Unsteady, short strides', 'Moves, but upright and slow', 'Good stride most of the time', 'Strong stride and quick starts', 'Explosive, among the fastest here']
  },
  soccer: {
    'First touch': ['Ball bounces away', 'Controls easy balls only', 'Controls most balls, sets up the next touch', 'Clean first touch under pressure', 'Touch that beats a defender'],
    Passing: ['Passes often go astray', 'Short passes, not always on target', 'Accurate short and medium passes', 'Weighted passes with both feet', 'Breaks lines, sees passes others miss']
  }
};
function sampleGuides(form, sport) {
  const key = gkey(form);
  if (LEVELS[key]) form.levels = { key, g: Object.assign({}, LEVELS[key]), sample: true };
  const sk = SAMPLE_SKILL_GUIDES[sport];
  if (sk && key === '5/1') for (const k of form.skills) if (sk[k.name]) k.guide = { key, g: Object.fromEntries(sk[k.name].map((t, i) => [i + 1, t])) };
  return form;
}
/* what a score means for this skill, or '' */
function guideText(f, k, v) {
  if (v == null || !guideFits(f) || f.showGuides === false) return '';
  const key = gkey(f), own = k.guide && k.guide.key === key ? k.guide.g : null, all = f.levels && f.levels.key === key ? f.levels.g : null;
  return (own && own[v]) || (all && all[v]) || '';
}
const hasGuide = (f, k) => guideFits(f) && f.showGuides !== false && scaleValues(f).some(([v]) => guideText(f, k, v));
/* the line under a score row */
function guideLine(f, k, v) {
  const t = guideText(f, k, v); if (!t) return null;
  const lab = (scaleValues(f).find(([x]) => x === v) || [])[1];
  return h('div', { class: 'gline' }, h('b', null, lab), ' ', t);
}
/* the whole guide for a skill (tap the guide button while scoring) */
function guideSheet(f, k) {
  openSheet((s, api) => s.append(h('h2', null, k.name),
    h('div', { class: 'glist' }, scaleValues(f).slice().reverse().map(([v, l]) => { const t = guideText(f, k, v); return t ? h('div', { class: 'grow2' }, h('b', null, l), h('span', null, t)) : null; })),
    h('div', { class: 'acts' }, h('button', { class: 'btn primary', onclick: () => api.close() }, 'Got it'))));
}
const guideBtn = (f, k) => hasGuide(f, k) ? h('button', { class: 'mini gbtn', 'aria-label': k.name + ' score guide', onclick: () => guideSheet(f, k) }, icon('guide')) : null;

/* ---------------- editing (Form tab) ---------------- */
function guidesPart(ev) {
  const f = ev.form;
  if (!guideFits(f)) return [sect('Score guides'), h('p', { class: 'note' }, 'Score guides work with scales up to 10 points. This scale uses a slider.')];
  const key = gkey(f), all = f.levels && f.levels.key === key ? f.levels.g : null;
  const ownCount = allSkills(ev).filter(k => k.guide && k.guide.key === key).length;
  return [sect('Score guides', h('span', { class: 'cnt' }, all || ownCount ? 'on' : 'off')),
    h('p', { class: 'note', style: 'margin:-2px 0 8px' }, 'A short line for what each score means. Evaluators see it under the score they tap, so everyone scores alike.'),
    h('div', { class: 'list', style: 'gap:6px' },
      h('button', { class: 'krow', onclick: () => guideEditSheet(ev, null) }, h('div', { class: 'knm grow' }, h('div', { class: 'pnm' }, 'Every skill'), h('div', { class: 'pmeta ellip' }, all ? Object.keys(all).length + ' lines' + (f.levels.sample ? ' · sample' : '') : 'Not set')), icon('chev')),
      allSkills(ev).map(k => h('button', { class: 'krow', onclick: () => guideEditSheet(ev, k) }, h('div', { class: 'knm grow' }, h('div', { class: 'pnm' }, k.name), h('div', { class: 'pmeta' }, k.guide && k.guide.key === key ? 'Own guide' : all ? 'Uses the general guide' : 'No guide')), icon('chev')))),
    h('div', { class: 'toprow', style: 'margin-top:10px' },
      LEVELS[key] && !all ? h('button', { class: 'btn', onclick: () => { sampleGuides(f, ev.sport); touch(ev); render(); toast('Sample guides added. Tap any line to change it.'); } }, icon('plus'), 'Add sample guides') : null,
      all || ownCount ? h('button', { class: 'chip' + (f.showGuides === false ? '' : ' on'), onclick: () => { f.showGuides = f.showGuides === false ? true : false; touch(ev); render(); } }, f.showGuides === false ? null : icon('check', 14), 'Show while scoring') : null)];
}
function guideEditSheet(ev, k) {
  const f = ev.form, key = gkey(f), vals = scaleValues(f).slice().reverse();
  const cur = k ? (k.guide && k.guide.key === key ? k.guide.g : {}) : (f.levels && f.levels.key === key ? f.levels.g : {});
  openSheet((s, api) => {
    const inputs = vals.map(([v, l]) => [v, h('input', { class: 'inp', value: cur[v] || '', maxlength: '90', placeholder: k ? (guideText(Object.assign({}, f, { showGuides: true }), { id: '' }, v) || 'What a ' + l + ' looks like') : 'What a ' + l + ' looks like', 'aria-label': 'Score ' + l })]);
    s.append(h('h2', null, k ? k.name : 'Every skill'),
      h('p', { class: 'note' }, k ? 'Lines left empty use the general guide.' : 'Used for every skill without its own guide.'),
      h('div', { class: 'stack', style: 'margin-top:10px' }, inputs.map(([v, inp]) => h('div', { class: 'grow2 edit' }, h('b', null, (vals.find(x => x[0] === v) || [])[1]), inp))),
      h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => api.close() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => {
          const g = {}; for (const [v, inp] of inputs) { const t = clean(inp.value, 90); if (t) g[v] = t; }
          if (k) { if (Object.keys(g).length) k.guide = { key, g }; else delete k.guide; }
          else { if (Object.keys(g).length) f.levels = { key, g }; else delete f.levels; }
          touch(ev); api.close(); render();
        } }, 'Save')));
  });
}
