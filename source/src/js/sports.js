/* =====================================================================
   Sport templates: the starting form for each sport. Organizers can change everything per event,
   and save their own versions as templates. These built-in lists never change on their own.
   words: how the app talks for this sport (team or squad, position or event group, player or athlete).
   alt: an optional second skill list for one position (goalies in hockey and ringette).
   tests: measured tests (better: 'low' = lower is better, e.g. a time).
   ===================================================================== */
const TEAM_WORDS = { team: 'team', teams: 'teams', player: 'player', players: 'players', position: 'position', positions: 'positions', tryout: 'tryout' };
const SPORTS = [
  { id: 'volleyball', name: 'Volleyball', skills: ['Serving', 'Passing', 'Setting', 'Attacking', 'Blocking', 'Digging', 'Movement', 'Court awareness', 'Gameplay'],
    positions: ['Setter', 'Outside', 'Middle', 'Opposite', 'Libero'], tests: [['Vertical jump', 'cm', 'high'], ['Approach jump', 'cm', 'high']] },
  { id: 'basketball', name: 'Basketball', skills: ['Ball handling', 'Shooting', 'Passing', 'Finishing', 'Defense', 'Rebounding', 'Court sense', 'Effort'],
    positions: ['Guard', 'Wing', 'Forward', 'Post'], tests: [['Vertical jump', 'cm', 'high'], ['Lane agility', 's', 'low']] },
  { id: 'hockey', name: 'Hockey', skills: ['Skating forward', 'Skating backward and edges', 'Puck control', 'Passing', 'Shooting', 'Hockey sense', 'Compete'],
    positions: ['Forward', 'Defence', 'Goalie'], alt: { pos: 'Goalie', skills: ['Positioning', 'Skating and movement', 'Rebound control', 'Glove', 'Blocker', 'Puck handling', 'Compete'] },
    tests: [['Lap skate', 's', 'low']] },
  { id: 'soccer', name: 'Soccer', skills: ['First touch', 'Passing', 'Dribbling', 'Shooting', 'Defending', 'Positioning and vision', 'Speed and fitness'],
    positions: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'], tests: [['40 m sprint', 's', 'low']] },
  { id: 'lacrosse', name: 'Lacrosse', skills: ['Catching and throwing', 'Ground balls', 'Shooting', 'Defense', 'Off-ball movement', 'Game sense', 'Effort'],
    positions: ['Attack', 'Midfield', 'Defence', 'Goalie'], tests: [['40 m sprint', 's', 'low']] },
  { id: 'ringette', name: 'Ringette', skills: ['Skating forward', 'Skating backward and edges', 'Ring control', 'Passing', 'Shooting', 'Ringette sense', 'Compete'],
    positions: ['Forward', 'Centre', 'Defence', 'Goalie'], alt: { pos: 'Goalie', skills: ['Positioning', 'Skating and movement', 'Rebound control', 'Glove', 'Stick work', 'Compete'] },
    tests: [['Lap skate', 's', 'low']] },
  { id: 'baseball', name: 'Baseball', skills: ['Hitting', 'Bunting', 'Fielding ground balls', 'Fly balls', 'Throwing and arm', 'Base running', 'Pitching', 'Catching', 'Baseball sense', 'Effort'],
    positions: ['Pitcher', 'Catcher', 'First', 'Second', 'Third', 'Shortstop', 'Left', 'Centre', 'Right'], tests: [['Home to first', 's', 'low'], ['60-yard dash', 's', 'low'], ['Pop time', 's', 'low']] },
  { id: 'softball', name: 'Softball', skills: ['Hitting', 'Slapping and bunting', 'Fielding ground balls', 'Fly balls', 'Throwing and arm', 'Base running', 'Pitching', 'Catching', 'Softball sense', 'Effort'],
    positions: ['Pitcher', 'Catcher', 'First', 'Second', 'Third', 'Shortstop', 'Left', 'Centre', 'Right'], tests: [['Home to first', 's', 'low'], ['Pop time', 's', 'low']] },
  { id: 'football', name: 'Football', skills: ['Speed', 'Agility', 'Footwork', 'Tackling', 'Blocking', 'Catching', 'Ball security', 'Football sense', 'Compete'],
    positions: ['QB', 'RB', 'Receiver', 'Tight end', 'O-line', 'D-line', 'Linebacker', 'DB', 'Kicker'], tests: [['40-yard dash', 's', 'low'], ['Shuttle', 's', 'low'], ['Broad jump', 'cm', 'high'], ['Vertical jump', 'cm', 'high']] },
  { id: 'flagfootball', name: 'Flag football', skills: ['Speed', 'Agility', 'Flag pulling', 'Catching', 'Route running', 'Throwing', 'Coverage', 'Game sense'],
    positions: ['QB', 'Centre', 'Receiver', 'Rusher', 'Defensive back'], tests: [['40-yard dash', 's', 'low'], ['Shuttle', 's', 'low']] },
  { id: 'rugby', name: 'Rugby', skills: ['Tackling', 'Breakdown and rucking', 'Ball carrying', 'Passing', 'Catching', 'Kicking', 'Support play', 'Rugby sense', 'Fitness'],
    positions: ['Prop', 'Hooker', 'Lock', 'Back row', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback'], tests: [['40 m sprint', 's', 'low'], ['Bronco', 's', 'low']] },
  { id: 'track', name: 'Track and field', skills: ['Technique', 'Starts', 'Speed', 'Endurance', 'Coachability', 'Effort'],
    positions: ['Sprints', 'Hurdles', 'Distance', 'Jumps', 'Throws'], tests: [['100 m', 's', 'low'], ['400 m', 's', 'low'], ['Long jump', 'm', 'high'], ['Shot put', 'm', 'high']],
    words: { team: 'squad', teams: 'squads', player: 'athlete', players: 'athletes', position: 'event group', positions: 'event groups', tryout: 'trial' } },
  { id: 'swimming', name: 'Swimming', skills: ['Stroke technique', 'Starts', 'Turns', 'Underwater kicks', 'Streamline', 'Endurance', 'Effort'],
    positions: ['Free', 'Back', 'Breast', 'Fly', 'IM'], tests: [['50 free', 's', 'low'], ['100 IM', 's', 'low']],
    words: { team: 'squad', teams: 'squads', player: 'swimmer', players: 'swimmers', position: 'stroke', positions: 'strokes', tryout: 'trial' } },
  { id: 'blank', name: 'Blank', skills: [], positions: [], tests: [] }
];
const sportById = id => SPORTS.find(s => s.id === id) || SPORTS[SPORTS.length - 1];
const wordsOf = ev => Object.assign({}, TEAM_WORDS, (sportById(ev && ev.sport) || {}).words || {});
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

let uidN = 0;
const uid = (p) => (p || '') + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6);

/* the evaluation form an event starts with, made from a sport template (or a saved template) */
function formFromSport(id) {
  const s = sportById(id);
  return {
    scale: '5',
    skills: s.skills.map(n => ({ id: uid('k'), name: n, w: 1 })),
    alt: s.alt ? { pos: s.alt.pos, skills: s.alt.skills.map(n => ({ id: uid('k'), name: n, w: 1 })) } : null,
    positions: s.positions.slice(),
    tests: (s.tests || []).map(([name, unit, better]) => ({ id: uid('t'), name, unit, better })),
    divisions: [],
    combine: 'avg'
  };
}
/* a copy of a form with fresh ids (for templates, so two events never share ids by accident) */
function copyForm(f) {
  const c = JSON.parse(JSON.stringify(f));
  c.skills.forEach(k => { k.id = uid('k'); });
  if (c.alt) c.alt.skills.forEach(k => { k.id = uid('k'); });
  c.tests.forEach(t => { t.id = uid('t'); });
  return c;
}
const SCALES = [['5', '1 to 5'], ['10', '1 to 10'], ['pcm', '+ / ✓ / −']];
