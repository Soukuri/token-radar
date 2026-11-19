// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a full detail page per protocol and the live-token
// view. No network: every byte it shows is in data.js. Routes are hash-based so each view has its
// own URL: #/ is the board, #/protocol/<slug> is one protocol, #/filter/<category> is a filtered
// board, #/live is the live-token table.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('main');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, view: 'board', slug: null };
  var WATCH = {};
  DATA.rows.forEach(function (r) { WATCH[r.slug] = false; });
  (DATA.watchlist_slugs || []).forEach(function (s) { WATCH[s] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // The model, recomputed in the page from the snapshot figures, so the page's number and the
  // board's number are visibly the same arithmetic: implied = TVL x category multiple x growth x maturity.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity));
  }

  // ---- farm plans: the same derivation main.ts writes to board.json ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 120;
    if (p.tvl_usd >= 1e7) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function primaryAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the supply position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s largest pool on " + chain + ', a stablecoin pair when one exists, and keep the position in range.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position, sized so a normal move cannot liquidate it.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds inside the destination app instead of bridging straight back.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and leave the shares untouched.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it while the yield accrues.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position through at least one funding cycle.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the farming wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for a protocol you already use, and keep the policy active.';
    if (c.indexOf('payment') >= 0) return 'Fund a $' + capital + ' balance on ' + name + ' and make one real payment or settlement through it on ' + chain + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC onto ' + name + "'s chain and use it in one native app there, so the wallet shows real activity on the chain.";
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and take one small position in a market that settles within the month.';
    if (c.indexOf('governance') >= 0) return 'Complete ' + name + "'s points program on " + chain + ': finish its listed quests and hold a $' + capital + ' position while they run.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondaryAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $25 of a stablecoin against the supply position on ' + name + ', repay it a week later, and keep the supply open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $25 of USDC for another asset through ' + name + ' on ' + chain + ' once a week, using its own router.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the first position on ' + name + ' after a week and open a fresh one of the same size, so the wallet shows repeated trading.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 back through ' + name + ' a week later, in the opposite direction, and keep a small balance on the destination chain.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Restake or compound the staking rewards ' + name + ' pays out, once, instead of withdrawing them.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Harvest the vault yield on ' + name + ' once and deposit the harvest straight back into the same vault.';
    if (c.indexOf('rwa') >= 0) return 'Check the accrued yield on the ' + name + ' position weekly and top the position up by $25 once it has run a month.';
    if (c.indexOf('basis') >= 0) return 'Leave the basis position untouched for a full funding cycle, then add $25 and note the funding rate you earned.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('curator') >= 0) return 'Move $25 between two ' + name + ' vaults once, so the wallet shows allocation activity as well as a deposit.';
    if (c.indexOf('insurance') >= 0) return 'Read the cover terms on ' + name + ' once and file the policy details in the farm log before the cover expires.';
    if (c.indexOf('payment') >= 0) return 'Make a second, smaller payment through ' + name + ' a week after the first, from the same wallet.';
    if (c.indexOf('stable') >= 0) return 'Swap $25 between the stable asset and USDC through ' + name + ' once, to show two-way use.';
    if (c.indexOf('chain') >= 0) return 'Try a second native app on ' + name + "'s chain with $25, so the wallet is not a one-app address.";
    if (c.indexOf('prediction') >= 0) return 'Settle or close the first market position on ' + name + ', then take one more small position in a different market.';
    if (c.indexOf('governance') >= 0) return 'Vote or signal in ' + name + "'s governance once, if a vote is open, and record the proposal in the farm log.";
    return 'Make a second, smaller deposit of $25 into ' + name + ' a week after the first, from the same wallet.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: primaryAction(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 120 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondaryAction(p, capital, chain), cost: '$25 of capital and about $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a swap, a borrow or a vote, so the wallet stays active.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page from the link the protocol itself publishes and check what the wallet earned.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, so you can repeat the position or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // ---- routing ----
  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    var parts = raw.split('/').filter(function (x) { return x !== ''; });
    state.view = 'board'; state.slug = null; state.tab = 'pre-token';
    if (parts[0] === 'protocol' && parts[1]) { state.view = 'detail'; state.slug = decodeURIComponent(parts[1]); return; }
    if (parts[0] === 'filter' && parts[1]) { state.view = 'board'; state.category = decodeURIComponent(parts[1]); return; }
    if (parts[0] === 'live') { state.view = 'board'; state.tab = 'live'; return; }
    if (parts[0] === 'filter' && !parts[1]) { state.category = 'all'; }
  }
  function go(hash) {
    if (window.location.hash !== hash) window.location.hash = hash;
    else { readHash(); render(); }
  }
  function boardHash() {
    if (state.category !== 'all') return '#/filter/' + encodeURIComponent(state.category);
    if (state.tab === 'live') return '#/live';
    return '#/';
  }

  // ---- data views ----
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---- small DOM helpers ----
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('a', { href: '#/', class: 'brand', onclick: function (e) { e.preventDefault(); go('#/'); } },
          el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' }))),
      el('span', { class: 'brand-sub', text: 'Pre-token protocols, ranked by implied value' }),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>' + fmtUsd(DATA.floor_usd) + '</b> of TVL and no token on record. The early radar adds <b>' + DATA.early_size + '</b> pre-token protocols below that floor, every one of them rankable. Implied value is a model, not a promise — and never a prediction that a token launches.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { html: DATA.watchlist_size + ' <em>/ ' + DATA.watchlist_size + '</em>' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; go(boardHash()); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; go(boardHash()); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; go('#/live'); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; go('#/'); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.slug === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { go('#/protocol/' + encodeURIComponent(r.slug)); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('#/protocol/' + encodeURIComponent(r.slug)); } }
      },
        el('td', { class: 'num rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, WATCH[r.slug] ? el('span', { class: 'chip watch', text: 'watchlist' }) : el('span', { class: 'chip', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: state.category !== 'all' ? 'Filtered: ' + state.category + ' — pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'chip live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula', html: 'implied = round( tvl_usd × <b>category multiple</b> × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') )' }),
      el('p', { text: 'The category multiple is the market’s own FDV/TVL for that category: the median mcap/TVL of the live-token protocols in it (at least ' + m.min_category_peers + ' peers, else the global median of ' + DATA.global_multiple + '), clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. Age is the time since the protocol was first listed — how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' })
    );
  }

  function detailView() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.slug) row = r; });
    if (!row) {
      return el('div', { class: 'shell' }, header(),
        el('div', { class: 'panel' }, el('div', { class: 'empty' },
          el('h2', { text: 'No protocol with that slug' }),
          el('p', { text: 'The link may name a protocol outside this board.' }),
          el('button', { class: 'button', type: 'button', text: 'Back to the board', onclick: function () { go('#/'); } })
        )));
    }
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(el('p', { class: 'crumbs' },
      el('a', { href: '#/', onclick: function (e) { e.preventDefault(); go('#/'); }, text: '← Board' }),
      document.createTextNode('  ·  Rank ' + row.rank + ' of ' + DATA.board_size)
    ));
    shell.appendChild(el('div', { class: 'detail-head' },
      el('span', { class: 'kicker', text: (WATCH[row.slug] ? 'Watchlist · ' : '') + 'Pre-token · Rank ' + row.rank }),
      el('h1', { text: row.name }),
      el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'on an unknown date') })
    ));
    shell.appendChild(el('div', { class: 'stats-grid' },
      el('div', { class: 'stat' }, el('span', { text: 'Implied value' }), el('b', { class: 'gold', text: fmtUsd(row.implied_value_usd) })),
      el('div', { class: 'stat' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
      el('div', { class: 'stat' }, el('span', { text: '7-day TVL change' }), el('b', { class: row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
      el('div', { class: 'stat' }, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
      el('div', { class: 'stat' }, el('span', { text: 'Category multiple' }), el('b', { text: row.category_multiple.toFixed(4) })),
      el('div', { class: 'stat' }, el('span', { text: 'Growth × maturity' }), el('b', { text: row.growth_multiplier + ' × ' + row.maturity_multiplier }))
    ));
    shell.appendChild(el('section', { class: 'detail-section' },
      el('h2', { text: 'The model, step by step' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { text: row.category_multiple.toFixed(4) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'gold', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Page recomputes' }), el('b', { text: fmtUsd(recomputed) }))
      ),
      el('p', { text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board — the data would be stale.') + ' The category multiple is the median mcap/TVL of the live-token protocols in this category; the global median is ' + DATA.global_multiple + '. This is an estimate, not a price, and never a prediction that a token launches.' })
    ));
    shell.appendChild(el('section', { class: 'detail-section' },
      el('h2', { text: 'Farm plan — seven steps' }),
      el('p', { text: 'What to do to farm ' + row.name + ' before any token exists. Costs are the gas and capital the steps themselves need.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    shell.appendChild(el('p', { class: 'note', html: '<b>Farm safely:</b> use only the protocol’s own site, never pay to claim anything, and never share a seed phrase. A protocol that records no token may still have one its DefiLlama record does not carry.' }));
    return shell;
  }

  function render() {
    app.textContent = '';
    if (state.view === 'detail') {
      app.appendChild(detailView());
    } else {
      var shell = el('div', { class: 'shell' });
      shell.appendChild(header());
      shell.appendChild(lede());
      shell.appendChild(controls());
      shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
      if (state.tab === 'pre-token') shell.appendChild(modelPanel());
      app.appendChild(shell);
    }
    app.setAttribute('aria-busy', 'false');
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
})();
