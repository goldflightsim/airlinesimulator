// ============================================================
// UI: LICENSES PAGE
// ============================================================

function renderLicensesPage() {
  const list = document.getElementById('licenses-list');
  if (!list) return;
  list.innerHTML = Object.values(LICENSES).map(renderLicenseCard).join('');
}

function renderLicenseCard(lic) {
  const state = gameState.airline.licenses[lic.id] || { owned: false };
  const missingReqs = lic.requires.filter(r => !hasLicense(r));
  const canBuy = !state.owned && missingReqs.length === 0 && gameState.finance.cash >= lic.cost;

  let actionHtml;
  if (state.owned) {
    actionHtml = lic.annualFee > 0
      ? `<button class="btn danger" onclick="revokeLicense('${lic.id}')">Revoke License</button>`
      : `<span style="color:var(--green); font-family:var(--font-mono); font-size:13px;">Owned</span>`;
  } else {
    actionHtml = `<button class="btn primary" ${canBuy ? '' : 'disabled'} onclick="purchaseLicense('${lic.id}')">Purchase &mdash; ${formatMoney(lic.cost)}</button>`;
  }

  const nextDueRow = (state.owned && state.nextDueMinute)
    ? `<div class="strip-row"><span class="k">Next renewal</span><span class="v">${formatGameDate(state.nextDueMinute)} &middot; ${formatMoney(lic.annualFee)}</span></div>`
    : '';

  const reqNote = (!state.owned && missingReqs.length > 0)
    ? `<div style="color:var(--amber); font-size:11px; margin-top:6px;">Requires ${missingReqs.map(r => LICENSES[r].name).join(', ')} first.</div>`
    : '';

  return `
    <div class="strip" style="margin-bottom:12px; max-width:480px;">
      <h3>${lic.name} ${state.owned ? '<span style="color:var(--green); font-size:12px;">&middot; Owned</span>' : ''}</h3>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">${lic.description}</div>
      <div class="strip-row"><span class="k">One-time cost</span><span class="v">${formatMoney(lic.cost)}</span></div>
      ${lic.annualFee > 0 ? `<div class="strip-row"><span class="k">Annual fee</span><span class="v">${formatMoney(lic.annualFee)}</span></div>` : ''}
      ${lic.requires.length > 0 ? `<div class="strip-row"><span class="k">Requires</span><span class="v">${lic.requires.map(r => LICENSES[r].name).join(', ')}</span></div>` : ''}
      ${nextDueRow}
      ${reqNote}
      <div style="margin-top:10px;">${actionHtml}</div>
    </div>
  `;
}

// Small "Year X, Month Y" formatter for license renewal dates.
function formatGameDate(totalMinutes) {
  const d = deriveDate(totalMinutes);
  return `Year ${d.year}, Month ${d.month}`;
}

function notifyLicensesRevoked(names) {
  openModal(`
    <h2>License${names.length > 1 ? 's' : ''} Revoked</h2>
    <div class="modal-sub">Couldn't cover the annual renewal fee, so the following ${names.length > 1 ? 'were' : 'was'} automatically revoked:</div>
    <div class="field">
      ${names.map(n => `<div class="strip-row"><span class="k">${n}</span><span class="v neg">Revoked</span></div>`).join('')}
    </div>
    <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">Existing aircraft and routes that relied on these licenses keep running — you just can't acquire new ones until you renew.</div>
    <div class="modal-actions">
      <div></div>
      <div><button class="btn primary" onclick="closeModal()">OK</button></div>
    </div>
  `);
}
