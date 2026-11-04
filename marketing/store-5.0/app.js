/* The 8 store screens, drawn as the app draws them (night theme, iPhone points).
   Layout, copy and sizes follow the components named above each screen in mobile/src. */
const App = (() => {
  const g = (name, size = 24, weight = 'regular', cls = '') => {
    const d = (GLYPHS[name][weight] || GLYPHS[name].regular).map((p) => `<path d="${p}"/>`).join('');
    return `<svg class="g ${cls}" width="${size}" height="${size}" viewBox="0 0 256 256">${d}</svg>`;
  };

  const qr = (key, px) => {
    const { size, bits } = QR[key];
    let d = '';
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') d += `M${i % size} ${Math.floor(i / size)}h1v1h-1z`;
    return `<svg width="${px}" height="${px}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
  };

  /* organiser cover art (posters), 4:3; type scales with the cover */
  const POSTERS = {
    aurora: { bg: 'radial-gradient(60% 70% at 72% 28%, #ff9a5c, transparent 70%), radial-gradient(70% 80% at 12% 92%, #d81b60, transparent 70%), linear-gradient(160deg, #47104f, #14061f)',
      big: 'aurora<br>fest', small: '2026 · main stage night', color: '#fff4ea' },
    build: { bg: 'radial-gradient(70% 60% at 80% 100%, #2f6bff, transparent 70%), repeating-linear-gradient(0deg, rgb(255 255 255 / .07) 0 1px, transparent 1px 9%), repeating-linear-gradient(90deg, rgb(255 255 255 / .07) 0 1px, transparent 1px 7%), #0a1022',
      big: 'build<br>night', small: '24h hackathon · t-hub', color: '#e6eeff' },
    design: { bg: 'radial-gradient(circle at 78% 30%, #e0623a 0 22%, transparent 22.5%), linear-gradient(135deg, transparent 58%, #26262b 58% 78%, transparent 78%), #efe5d2',
      big: 'design<br>sprint', small: 'workshop · 2 days', color: '#1d1d21' },
    monsoon: { bg: 'repeating-linear-gradient(105deg, rgb(255 255 255 / .1) 0 1px, transparent 1px 6%), radial-gradient(80% 70% at 30% 20%, #19b8a6, transparent 70%), linear-gradient(170deg, #1e2a78, #0b1030)',
      big: 'monsoon<br>beats', small: 'live · open air', color: '#e9fffb' },
  };
  const cover = (k, cls = '') => {
    const p = POSTERS[k];
    return `<div class="cover ${cls}" style="background:${p.bg};container-type:inline-size">
      <div style="position:absolute;left:8cqw;bottom:8cqw;color:${p.color}">
        <div style="font-family:'DM Sans';font-weight:500;font-size:17cqw;line-height:.86;letter-spacing:-.05em">${p.big}</div>
        <div style="font-weight:600;font-size:4.6cqw;margin-top:3cqw;opacity:.8">${p.small}</div></div></div>`;
  };
  const thumb = (k, w, h) => `<div class="thumb" style="width:${w}px;height:${h}px">${cover(k, 'fill')}</div>`;

  /* chrome */
  const status = (o) => {
    const c = '#fff';
    const icons = `<span class="row" style="gap:6px">
      <svg width="18" height="12" viewBox="0 0 18 12"><g fill="${c}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></g></svg>
      <svg width="16" height="12" viewBox="0 0 16 12"><path fill="${c}" d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3C13.5 1.4 10.9.3 8 .3S2.5 1.4.5 3.4l1.3 1.3C3.4 3.1 5.6 2.2 8 2.2zm0 3.8c1.4 0 2.6.5 3.5 1.4l1.3-1.3C11.6 4.9 9.9 4.1 8 4.1s-3.6.8-4.8 2l1.3 1.3C5.4 6.5 6.6 6 8 6zm0 3.6 2-2c-.5-.5-1.2-.8-2-.8s-1.5.3-2 .8z"/></svg>
      <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="${c}" stroke-opacity=".4"/><rect x="2" y="2" width="18" height="9" rx="2" fill="${c}"/><rect x="24.5" y="4.5" width="1.6" height="4" rx=".8" fill="${c}" fill-opacity=".45"/></svg></span>`;
    if (o.android) return `<div class="status android" style="height:${o.top}px"><span>9:41</span>${icons}</div><div class="punch"></div>`;
    if (o.ipad) return `<div class="status" style="height:${o.top}px;padding:0 22px;font-size:13px"><span>9:41&nbsp;&nbsp;Wed 4 Nov</span>${icons}</div>`;
    return `<div class="status"><span>9:41</span>${icons}</div><div class="island"></div>`;
  };
  /* iPadOS floats the tab bar at the top; phones keep it at the bottom */
  const tabs = (on, o) => {
    const t = [['home', 'cards'], ['tickets', 'wallet'], ['space', 'stack'], ['profile', 'user']];
    const at = o.ipad ? `style="top:${o.top + 6}px;bottom:auto"` : '';
    return `<div class="tabs glass ${o.android ? 'android' : ''}" ${at}>${t.map(([k, i]) => `<div class="t ${k === on ? 'on' : ''}">${g(i, 26, k === on ? 'fill' : 'regular')}</div>`).join('')}</div>`;
  };
  const nav = (o, title, right = '') => `<div class="nav glass" style="height:${o.top + 52}px;padding-top:${o.top}px"><div class="ic">${g('caret-left', 24, 'bold')}</div><div class="title">${title}</div>
    <div class="grow"></div>${right ? `<div class="ic">${right}</div>` : ''}</div>`;
  const lrow = (icon, color, label, val = '', end = g('caret-right', 15, 'regular', 'muted')) =>
    `<div class="lrow"><div class="ib ${color}">${g(icon, 24)}</div><div class="lab">${label}</div>${val ? `<div class="val">${val}</div>` : ''}${end}</div>`;
  const dateStub = (mon, day, line1, line2) => `<div class="lrow" style="gap:14px"><div class="col" style="width:56px;align-items:center">
      <span class="S muted" style="font-size:11px">${mon}</span><span class="F sky" style="font-size:26px;line-height:30px">${day}</span></div>
    <div class="col grow"><span class="S">${line1}</span><span class="B soft" style="font-size:12px">${line2}</span></div>${g('calendar-plus', 24)}</div>`;
  /* the pass: a sky shade card with notches at the tear line */
  const pass = (top, stub) => `<div class="shade sky" style="padding:0"><div class="shapes"></div>
      <div style="padding:17px">${top}</div>
      <div style="position:relative;height:22px"><div style="position:absolute;left:22px;right:22px;top:10px;border-top:1px dashed var(--outline)"></div>
        <div style="position:absolute;left:-11px;top:0;width:22px;height:22px;border-radius:11px;background:var(--bg)"></div>
        <div style="position:absolute;right:-11px;top:0;width:22px;height:22px;border-radius:11px;background:var(--bg)"></div></div>
      <div style="padding:6px 17px 20px">${stub}</div></div>`;
  const passTop = (k, statusHtml, title) => `<div class="row" style="gap:14px;align-items:flex-start">${thumb(k, 88, 66)}
      <div class="col grow" style="gap:4px"><div class="row S" style="gap:6px;font-size:12px">${statusHtml}</div>
      <div class="D" style="font-size:21px;line-height:27px;letter-spacing:-.4px">${title}</div></div></div>`;
  const pushTop = (w) => `<div style="height:${w}px"></div>`;
  /* tablets show more of each screen: the sections that sit below the phone's fold */
  const below = (o, html) => (o.w > 500 ? html : '');
  const evRow = (k, t, m) => `<div class="row" style="gap:14px;padding:10px 0;box-shadow:inset 0 -1px var(--border)">${thumb(k, 64, 48)}
    <div class="col grow"><span class="S">${t}</span><span class="B soft" style="font-size:12px">${m}</span></div>${g('caret-right', 15, 'regular', 'muted')}</div>`;

  const SCREENS = {
    /* app/(tabs)/index.tsx: HomeHeader, UpNextCard, HeroCarousel */
    home: (o) => `<div class="scroll">
      <div style="height:${o.top + 8 + (o.ipad ? 70 : 0)}px"></div>
      <div class="row" style="height:36px"><img src="../brand-2026/png/wordmark-silver-2400.png" style="height:22px">
        <div class="grow"></div><span class="row soft S" style="gap:4px;font-size:12px">${g('map-pin', 14, 'fill')}Hyderabad</span>
        <div style="width:36px;height:36px;display:grid;place-items:center;position:relative;margin-left:10px">${g('bell', 24, 'fill')}
          <span class="S" style="position:absolute;top:1px;right:0;min-width:16px;height:16px;border-radius:8px;background:var(--primary);color:#000;font-size:10px;display:grid;place-items:center">3</span></div></div>
      <div class="D" style="font-size:32px;line-height:38px;letter-spacing:-1.1px;margin-top:27px">What's on in Hyderabad?</div>
      <div class="row" style="gap:10px;margin-top:20px">
        <div class="row grow muted" style="height:52px;border-radius:14px;box-shadow:inset 0 0 0 1px var(--input);background:var(--card);padding:0 14px;gap:10px">${g('magnifying-glass', 18)}<span class="B">Search events, spaces, vibes</span></div>
        <div style="width:52px;height:52px;border-radius:14px;box-shadow:inset 0 0 0 1px var(--input);background:var(--card);display:grid;place-items:center">${g('sliders-horizontal', 20)}</div></div>
      <div class="row S muted" style="font-size:12px;margin-top:27px"><span class="grow">Up next</span><span>+2 more</span></div>
      <div class="shade sky" style="margin-top:10px;padding:17px"><div class="shapes"></div>
        <div class="row" style="gap:14px;align-items:flex-start"><div class="col grow">
          <span class="F sky" style="font-size:30px;line-height:36px">Tomorrow</span>
          <span class="S clamp2" style="font-size:16px;margin-top:4px">Aurora Fest 2026: Main stage night</span></div>${thumb('aurora', 84, 63)}</div>
        <div class="hair" style="margin:14px 0"></div>
        <div class="row"><div class="col grow"><span class="S">Sat · 6:30 PM</span><span class="B soft" style="font-size:12px">Shilpakala Vedika</span></div>
          <span class="btn" style="height:38px;border-radius:19px;padding:0 16px;font-size:13px">${g('qr-code', 16, 'bold')}Ticket</span></div></div>
      <div class="row" style="margin-top:41px"><span class="D grow" style="font-size:20px;line-height:26px;letter-spacing:-.3px">Happening near you</span>
        <span class="row S soft" style="gap:4px;font-size:12px">See all ${g('arrow-right', 13)}</span></div>
      <div class="row" style="gap:12px;margin-top:14px;align-items:flex-start;width:200%">
        ${[['build', 'Hackathon · T-Hub', 'Build Night: 24h Hackathon', 'Sat · 9:00 AM', '₹199'], ['monsoon', 'Music · Gachibowli', 'Monsoon Beats Live', 'Sun · 5:00 PM', '₹299']]
          .map(([k, f, t, m, p]) => `<div class="col" style="width:${o.w * 0.74}px">${cover(k)}
            <span class="S muted" style="font-size:11px;margin-top:10px">${f}</span><span class="S" style="font-size:16px;margin-top:2px">${t}</span>
            <span class="B soft" style="font-size:12px;margin-top:2px">${m} · <span class="muted">From</span> <span class="F">${p}</span></span></div>`).join('')}</div>
      ${below(o, `<div class="row" style="margin-top:41px"><span class="D grow" style="font-size:20px;line-height:26px;letter-spacing:-.3px">Trending now</span>
          <span class="row S soft" style="gap:4px;font-size:12px">See all ${g('arrow-right', 13)}</span></div><div style="margin-top:6px">
        ${evRow('design', 'Design Sprint Workshop', 'Fri · 10:00 AM · Aurora Tech Club')}${evRow('monsoon', 'Monsoon Beats Live', 'Sun · 5:00 PM · Decibel Society')}
        ${evRow('aurora', 'Aurora Fest 2026', 'Sat · 6:30 PM · Shilpakala Vedika')}${evRow('build', 'Build Night: 24h Hackathon', 'Sat · 9:00 AM · T-Hub')}</div>`)}
      </div>${tabs('home', o)}`,

    /* app/event-registration.tsx: FlowHeader, Steps (ticket options) and the ActionBar */
    book: (o) => {
      const opt = (name, sub, price, per, left, on, out) => `<div style="border-radius:20px;padding:17px;background:var(--raised);box-shadow:inset 0 0 0 1.5px ${on ? 'var(--primary)' : 'var(--card)'};${out ? 'opacity:.55' : ''}">
        <div class="row" style="gap:12px;align-items:flex-start"><div class="col grow"><span class="S" style="font-size:16px">${name}</span>
          <span class="B soft" style="font-size:12px;margin-top:2px">${sub}</span><span class="S ${out ? 'muted' : 'sky'}" style="font-size:12px;margin-top:8px">${left}</span></div>
          <div class="col" style="align-items:flex-end"><span class="F sky" style="font-size:16px">${price}</span>${per ? `<span class="B muted" style="font-size:11px">${per}</span>` : ''}</div>
          ${on ? g('check-circle', 24, 'fill') : ''}</div></div>`;
      return `<div class="row" style="position:absolute;top:${o.top}px;left:0;right:0;height:52px;padding:0 16px">${g('x', 24, 'bold')}
          <span class="S" style="position:absolute;left:60px;right:60px;text-align:center;font-size:17px">Build Night: 24h Hackathon</span></div>
        <div class="scroll" style="top:${o.top + 52}px">
          <div class="D" style="font-size:24px;line-height:30px;letter-spacing:-.6px;margin-top:20px">Pick your ticket</div>
          <div class="B soft" style="font-size:12px;margin-top:4px">Sat · 9:00 AM · T-Hub, Raidurg</div>
          <div class="col" style="gap:10px;margin-top:20px">
            ${opt('Early bird', 'Just you', '₹199', '', 'Sold out', false, true)}
            ${opt('Solo', 'Just you', '₹349', '', '212 left', false)}
            ${opt('Duo', 'Team of 2', '₹649', 'per team', '41 left', false)}
            ${opt('Squad', 'Team of 2 to 4', '₹1,099', 'per team', 'Only 5 left', true)}</div>
          <div class="B soft" style="font-size:12px;margin-top:17px;line-height:1.5">Book once for the whole team. Add your teammates' emails and each gets an invite once you pay.</div></div>
        <div class="glass row" style="position:absolute;left:0;right:0;bottom:0;padding:14px 17px 40px;border-radius:22px 22px 0 0;gap:14px">
          <div class="col grow"><span class="S muted" style="font-size:11px">Total</span><span class="F" style="font-size:18px">₹1,099</span></div>
          <span class="btn" style="min-width:148px">Continue</span></div>`;
    },

    /* app/ticket/[id].tsx: TicketDetailScreen pass, stub and facts */
    ticket: (o) => `<div class="scroll">${pushTop(o.top + 66)}
        ${pass(passTop('aurora', `<span class="dot sky"></span><span class="sky">Tomorrow</span>`, 'Aurora Fest 2026: Main stage night'),
          `<div class="col" style="align-items:center"><div style="background:#fff;padding:14px;border-radius:12px">${qr('ticket', 220)}</div>
            <span class="F sky" style="font-size:18px;letter-spacing:2px;margin-top:14px">UFS-7K2Q9</span>
            <span class="B soft" style="font-size:12px;margin-top:4px">Show this at the entrance</span></div>`)}
        <div style="margin-top:10px">${dateStub('Nov', '15', 'Saturday', '6:30 PM – 10:00 PM')}
          ${lrow('map-pin', '', '<div class="col"><span>Shilpakala Vedika</span><span class="B soft" style="font-size:12px">Madhapur, Hyderabad</span></div>')}
          ${lrow('ticket', 'sky', '<span class="sky">Regular · ₹349</span>')}
          ${lrow('users-three', 'sky', 'Manage group')}
          ${below(o, `${lrow('share-network', '', "Share that I'm going")}${lrow('trophy', '', 'Unifesto Sprint')}${lrow('chats-circle', '', 'WhatsApp group', 'Join the group')}
            ${lrow('check-circle', '', 'Check-ins')}${lrow('ticket', 'danger', '<span class="danger">Refund and status</span>')}${lrow('x', 'danger', '<span class="danger">Cancel ticket</span>')}`)}</div></div>
      ${nav(o, 'Ticket', g('share-network', 22))}<div class="home-ind"></div>`,

    /* the live cards on a ticket: LivePollsPanel, LiveQaPanel, LiveQuizPanel */
    live: (o) => {
      const opt = (label, pct, mine, color = 'mint') => `<div style="position:relative;height:44px;border-radius:14px;box-shadow:inset 0 0 0 1px ${mine ? 'var(--primary)' : 'var(--border)'};overflow:hidden">
        <div style="position:absolute;inset:0 auto 0 0;width:calc(${pct || 0}% * var(--p, 1));background:var(--tint)"></div>
        <div class="row" style="position:relative;height:44px;padding:0 14px;gap:8px"><span class="S grow">${label}</span>
          ${mine ? g('check-circle', 18, 'fill', color) : ''}${pct == null ? '' : `<span class="F ${color}" style="font-size:12px">${pct}%</span>`}</div></div>`;
      const head = (t, right = '') => `<div class="row" style="gap:8px"><span class="dot mint"></span><span class="S grow" style="font-size:16px">${t}</span>${right}</div>`;
      const q = (n, text, meta, on) => `<div class="row" style="gap:12px;padding:10px 0;align-items:flex-start;box-shadow:inset 0 -1px var(--border)">
        <div class="col" style="width:44px;height:44px;border-radius:14px;background:var(--tint);align-items:center;justify-content:center;${on ? 'color:var(--mint)' : ''}">${g('caret-up', 16, 'bold')}<span class="F" style="font-size:12px">${n}</span></div>
        <div class="col grow"><span class="B" style="font-size:14px">${text}</span><span class="B muted" style="font-size:11px;margin-top:2px">${meta}</span></div></div>`;
      return `<div class="scroll">${pushTop(o.top + 66)}
        <div class="card">${head('Live polls')}
          <div class="S" style="margin-top:10px">Which act should close the night?</div>
          <div class="col" style="gap:8px;margin-top:10px">${opt('Lost Signals', 48, true)}${opt('Night Owls', 31)}${opt('Paper Planes', 21)}</div>
          <div class="B muted" style="font-size:11px;margin-top:10px">214 votes so far</div></div>
        <div class="card" style="margin-top:20px">${head('Q&A')}
          <div class="row" style="gap:8px;margin-top:12px"><div class="row grow muted B" style="height:44px;border-radius:14px;box-shadow:inset 0 0 0 1px var(--input);padding:0 14px">Ask a question</div>
            <span class="btn sm" style="height:44px">Ask</span></div>
          ${q(42, 'Will the main stage set be recorded?', 'Answered · Priya', true)}${q(17, 'Is there a re-entry after 9 PM?', 'Kabir')}</div>
        <div class="card" style="margin-top:20px">${head('Music trivia', '<span class="S muted" style="font-size:12px">2 of 10</span>')}
          <div class="row" style="gap:12px;margin-top:10px"><span class="F mint" style="font-size:22px">12s</span><span class="S grow">Which year did Aurora Fest begin?</span></div>
          <div class="col" style="gap:8px;margin-top:10px">${opt('2019', null)}${opt('2021', null)}</div>
          ${below(o, `<div class="B muted" style="font-size:11px;margin-top:10px">One answer each. Faster right answers score more.</div>
            <div class="S" style="margin-top:17px">Leaderboard</div>
            ${[['1', 'Ananya', '180'], ['2', 'Rohan', '150'], ['3', 'You', '120', true], ['4', 'Kabir', '110']].map(([r, n, s, me]) => `<div class="row" style="gap:12px;padding:8px 0;box-shadow:inset 0 -1px var(--border)">
              <span class="F muted" style="font-size:12px;width:16px">${r}</span><span class="B grow" style="font-size:12px">${n}</span><span class="F ${me ? 'mint' : ''}" style="font-size:12px">${s}</span></div>`).join('')}
            <div class="B soft" style="font-size:12px;margin-top:10px">You're #3 of 48 · 120 pts</div>`)}</div>
      </div>${nav(o, 'Ticket', g('share-network', 22))}<div class="home-ind"></div>`;
    },

    /* app/hackathon/[eventId]: HackathonHubScreen, QuickTiles */
    sprint: (o) => {
      const tile = (icon, color, label) => `<div class="col grow" style="background:var(--raised);border-radius:20px;padding:14px;gap:10px"><span class="${color}">${g(icon, 26)}</span><span class="S" style="font-size:12px">${label}</span></div>`;
      return `<div class="scroll">${pushTop(o.top + 66)}
        <div class="shade blue" style="text-align:center"><div class="shapes"></div>
          <div class="col" style="align-items:center;padding:22px 17px 17px">
            <span class="S soft" style="font-size:12px">Build Night: 24h Hackathon</span>
            <span class="F" style="font-size:40px;line-height:48px;margin-top:6px">UFS-042</span>
            <span class="S soft" style="font-size:16px">Null Pointers · Lead</span></div>
          <div class="hair"></div>
          <div class="col" style="padding:14px 17px 18px;text-align:left"><span class="S">You're in</span>
            <span class="B soft" style="font-size:12px;margin-top:2px">Your problem statement is locked in. Good luck!</span></div></div>
        <div class="row" style="gap:10px;margin-top:20px">${tile('users-three', 'sky', '4/4 joined')}${tile('bell', '', 'Updates')}${tile('lifebuoy', '', 'Get help')}</div>
        <div class="group-title">Problem statement</div>${lrow('lightbulb', 'sky', 'PS-07 · Smart campus parking', 'Locked')}
        <div class="group-title">Judging</div>${lrow('gavel', '', 'Evaluation', 'Round open')}${lrow('link-simple', 'sky', 'Project links')}${lrow('trophy', 'ivory', 'Results and winners')}
        <div class="group-title">Where to be</div>${lrow('door-open', '', 'Lab 3, Block B')}${lrow('map-pin', '', 'Directions', '', g('arrow-up-right', 15, 'regular', 'muted'))}
      </div>${nav(o, 'Hackathon', g('bell-ringing', 24))}<div class="home-ind"></div>`;
    },

    /* app/manage/event/[eventId]: ManageEventScreen, ManageStats */
    manage: (o) => {
      const stat = (n, label, color) => `<div class="col grow" style="align-items:center"><span class="F ${color}" style="font-size:20px;line-height:28px">${n}</span><span class="B muted" style="font-size:12px">${label}</span></div>`;
      return `<div class="scroll">${pushTop(o.top + 66)}
        <div class="row" style="gap:14px">${thumb('aurora', 120, 90).replace('border-radius:12px', '')}
          <div class="col grow" style="gap:3px"><span class="D" style="font-size:18px">Aurora Fest 2026</span>
            <span class="row S mint" style="gap:6px;font-size:12px"><span class="dot"></span>Live now</span><span class="B soft" style="font-size:12px">Shilpakala Vedika</span></div></div>
        <span class="btn" style="width:100%;margin-top:17px">Open event day</span>
        <div class="card row" style="margin-top:17px;padding:17px 6px">${stat('412', 'Attending', 'sky')}<div style="width:1px;align-self:stretch;background:var(--border)"></div>
          ${stat('219', 'Checked in', 'mint')}<div style="width:1px;align-self:stretch;background:var(--border)"></div>${stat('38', 'Seats left', 'sky')}</div>
        <div style="height:6px;border-radius:3px;background:var(--tint);margin-top:17px;overflow:hidden"><div style="width:calc(53% * var(--p, 1));height:100%;background:var(--primary)"></div></div>
        <div class="B muted" style="font-size:12px;margin-top:8px">53% checked in · 193 to go</div>
        <div class="group-title">Check-in</div>${lrow('qr-code', 'mint', 'Scan tickets')}
        <div class="group-title">Live</div>${lrow('chart-bar', 'mint', 'Live polls', '1 open')}${lrow('chats-circle', 'mint', 'Live Q&A', '12 questions')}${lrow('lightbulb', 'mint', 'Live quizzes')}
        <div class="group-title">Money</div>${lrow('wallet', 'ivory', 'Transactions')}${lrow('arrow-up-right', 'ivory', 'Request payout')}
        ${below(o, `<div class="group-title">Attendees</div>${lrow('users-three', 'sky', 'Attendees', '412')}${lrow('plus', 'sky', 'Add attendee')}${lrow('cloud-arrow-up', 'sky', 'Import from CSV')}${lrow('ticket', 'sky', 'Waiting list', '6 waiting')}
          <div class="group-title">More</div>${lrow('chart-bar', '', 'Insights')}${lrow('link-simple', '', 'Event page')}`)}
      </div>${nav(o, 'Manage event', g('dots-three', 24, 'bold'))}<div class="home-ind"></div>`;
    },

    /* app/checkin/[eventId]/scanner.tsx: CheckinScannerScreen, ScanReticle, ScanResultCard */
    scan: (o) => {
      const arm = (pos) => `<div style="position:absolute;width:44px;height:44px;border:0 solid var(--mint);${pos}"></div>`;
      return `<div style="position:absolute;inset:0;background:
          radial-gradient(30% 18% at 18% 30%, rgb(255 180 90 / .35), transparent 70%), radial-gradient(22% 14% at 86% 24%, rgb(255 120 160 / .3), transparent 70%),
          radial-gradient(40% 30% at 50% 108%, rgb(90 130 255 / .25), transparent 70%), linear-gradient(#141217, #0b0b0d);filter:saturate(.9)"></div>
        <div style="position:absolute;left:50%;top:calc(52% - 170px);width:200px;height:380px;margin-left:-100px;border-radius:30px;background:#1b1b1f;transform:rotate(-6deg);box-shadow:0 30px 60px rgb(0 0 0 / .6);filter:blur(.6px)">
          <div style="position:absolute;left:20px;right:20px;top:90px;background:#fff;border-radius:10px;padding:10px">${qr('scan', 140)}</div></div>
        <div style="position:absolute;inset:0;background:rgb(0 0 0 / .25)"></div>
        <div class="col" style="position:absolute;top:${o.top + 64}px;left:0;right:0;align-items:center;gap:5px;color:#fff">
          <span class="row S" style="gap:5px">${g('map-pin', 15, 'fill')}Main gate</span>
          <span class="F" style="font-size:12px;color:rgb(255 255 255 / .7)"><span style="color:#fff">219</span> of 412 in · 193 to go</span>
          <span class="row S warn" style="gap:5px;font-size:12px">${g('wifi-slash', 14, 'bold')}Offline · using list saved at 6:10 PM</span></div>
        <div style="position:absolute;left:50%;top:calc(52% - 125px);width:250px;height:250px;margin-left:-125px">
          ${arm('left:0;top:0;border-left-width:4px;border-top-width:4px;border-top-left-radius:22px')}${arm('right:0;top:0;border-right-width:4px;border-top-width:4px;border-top-right-radius:22px')}
          ${arm('left:0;bottom:0;border-left-width:4px;border-bottom-width:4px;border-bottom-left-radius:22px')}${arm('right:0;bottom:0;border-right-width:4px;border-bottom-width:4px;border-bottom-right-radius:22px')}</div>
        <div class="row glass" style="position:absolute;left:20px;right:20px;bottom:120px;transform:translateY(calc((1 - var(--p, 1)) * 240px));opacity:var(--p, 1);border-radius:20px;padding:17px;gap:14px;background:rgb(20 20 20 / .7)">
          ${g('check-circle', 40, 'fill', 'mint')}<div class="col grow"><span class="S mint" style="font-size:12px">Checked in</span><span class="S" style="font-size:18px;color:#fff">Riya Patel</span>
          <span class="B soft" style="font-size:12px">Squad of 4 · 3 of 4 in</span></div><span class="btn sm ghost">Undo</span></div>
        <div class="row" style="position:absolute;left:20px;right:20px;bottom:44px;gap:10px">
          <div class="glass" style="width:52px;height:52px;border-radius:14px;display:grid;place-items:center;color:#fff">${g('flashlight', 22)}</div>
          <div class="glass row grow S" style="height:52px;border-radius:14px;padding:0 16px;gap:10px;color:#fff">${g('magnifying-glass', 20)}Search by name</div></div>
        <div class="row" style="position:absolute;top:${o.top}px;left:0;right:0;height:52px;padding:0 16px;color:#fff">${g('x', 24, 'bold')}
          <span class="S" style="position:absolute;left:0;right:0;text-align:center;font-size:17px">Scan tickets</span></div>
        <div class="home-ind"></div>`;
    },

    /* the same ticket once the event has ended: EventEnded stub and "After the event" */
    past: (o) => `<div class="scroll">${pushTop(o.top + 66)}
        ${pass(passTop('build', `<span class="dot muted"></span><span class="muted">Attended</span>`, 'Build Night: 24h Hackathon'),
          `<div class="col" style="align-items:center;padding:14px 0 6px">${g('confetti', 40, 'fill')}
            <span class="D" style="font-size:20px;margin-top:12px">This event has ended</span><span class="B muted" style="font-size:12px;margin-top:4px">Thanks for coming.</span></div>`)}
        <div class="group-title">After the event</div>
        ${lrow('star', '', 'My feedback', 'Sent')}${lrow('trophy', 'ivory', 'Results and winners')}${lrow('certificate', '', 'My certificate', '12 Nov', g('arrow-up-right', 15, 'regular', 'muted'))}
        <div class="group-title">Winners</div>
        ${lrow('trophy', 'ivory', '1 · Byte Me', '<span class="F">92.4</span>', '')}${lrow('trophy', 'ivory', '2 · Null Pointers <span class="B muted" style="font-size:12px">· my team</span>', '<span class="F">89.1</span>', '')}${lrow('trophy', 'ivory', '3 · Kernel Panic', '<span class="F">86.7</span>', '')}
      </div>${nav(o, 'Ticket', g('share-network', 22))}<div class="home-ind"></div>`,
  };

  const screens = [
    { id: 'home', cap: "Find what's on. *Near you, this week.*" },
    { id: 'book', cap: 'Book in seconds. *Solo or as a team.*' },
    { id: 'ticket', cap: 'Your ticket, *ready at the door.*' },
    { id: 'live', cap: 'Polls, Q&A and quizzes, *live.*' },
    { id: 'sprint', cap: 'Your hackathon, *in one hub.*' },
    { id: 'manage', cap: 'Run the whole event *from Space.*' },
    { id: 'scan', cap: 'Check in fast, *even offline.*' },
    { id: 'past', cap: 'Results and certificates, *after.*' },
  ];

  /* device: width in points and the safe-area top (status bar) */
  const DEVICES = {
    iphone: { w: 440, top: 54 },
    play: { w: 440, top: 40, android: true },
    ipad: { w: 1032, top: 24, ipad: true },
    tab: { w: 800, top: 32, android: true },
  };
  const render = (id, size) => {
    const o = DEVICES[size];
    return status(o) + SCREENS[id](o);
  };

  /* Play feature graphic, 1024x500: the Horizon sky, the wordmark and the line */
  const feature = () => {
    const el = document.createElement('section');
    el.className = 'page';
    el.style.cssText = '--w:1024px;--h:500px;background:#0a0a0b url(../brand-2026/png/horizon-sky-night-1920x1080.jpg) 70% 60% / 1100px auto no-repeat';
    el.innerHTML = `<img src="../brand-2026/png/wordmark-silver-2400.png" style="position:absolute;left:72px;top:150px;height:36px">
      <div class="cap" style="left:72px;right:470px;top:218px;font-size:56px;--cap:56px">Book events, <em>run them live.</em></div>
      <div class="device" style="left:auto;right:110px;top:62px;transform:none;--bezel:10px;--dev-r:48px">
        <div class="screen" style="--pt-w:440;--pt-h:956;--k:.74"><div class="app">${render('home', 'iphone')}</div></div></div>
      <div class="grain"></div>`;
    return el;
  };

  return { screens, render, feature };
})();
