// ----- admin auth (оставляем через localStorage) -----
const ADMIN_PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
let isAdmin = false;
if (localStorage.getItem('isAdmin') === '1') isAdmin = true;
let currentTab = 'kitpvp';

let draggedName = null, draggedFromTier = null, draggedType = null, draggedId = null;

function updateAddForms() {
  document.getElementById('kitpvp-form').style.display = isAdmin ? '' : 'none';
  document.getElementById('nezerpot-form').style.display = isAdmin ? '' : 'none';
}
function updateAuthUI() {
  document.getElementById('auth-indicator').innerHTML =
    isAdmin ? '<span class="dot" style="background:#4ecdc4"></span> Админ' : '<span class="dot"></span> Гость';
  document.getElementById('auth-btn').textContent = isAdmin ? 'Выйти' : 'Войти';
  document.getElementById('auth-btn').onclick = isAdmin ? logout : showAuthModal;
}
function switchGameTab(tab) {
  if(tab === currentTab) return;
  document.getElementById('tierlist-' + currentTab).classList.remove('active');
  document.getElementById(tab + '-btn').classList.add('active');
  document.getElementById(currentTab + '-btn').classList.remove('active');
  document.getElementById('tierlist-' + tab).classList.add('active');
  currentTab = tab;
  // нет render(); обновление будет через firebase
}
window.switchGameTab = switchGameTab;

// ========== FIRESTORE ===============
// ---- получить актуальные данные и подписка на изменения ----
function subscribePlayers(tab, callback) {
  onSnapshot(collection(db, tab), (snapshot) => {
    let obj = {1:[],2:[],3:[],4:[],5:[]};
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      if(obj[d.tier]) obj[d.tier].push({name:d.name, type:d.type, id:docSnap.id});
    });
    callback(obj);
  });
}
// добавить игрока
async function addPlayerToBase(tab, name, tier, type) {
  await addDoc(collection(db, tab), { name, tier, type });
}
// удалить игрока
async function deletePlayerFromBase(tab, id) {
  await deleteDoc(doc(db, tab, id));
}

// ========== РЕНДЕР!!! ==============
function render(tab, playersTab) {
  for(let tier=1;tier<=5;tier++) {
    let pArr = playersTab[tier] || [];
    document.getElementById(tab + '-tier' + tier).innerHTML = (pArr || []).filter(p => p && p.name)
    .map(p =>
      `<div class="player ${p.type}-tier" draggable="${isAdmin}" data-name="${p.name}" data-type="${p.type}" data-id="${p.id}" >
        ${p.type === 'high' ? 'HT' : 'LT'} | ${p.name}
      </div>`
    ).join('');
  }
  updateAddForms();
  updateAuthUI();
  enableDnD(tab, playersTab); // теперь передаем данные
  disableDnDForGuests();
  document.body.classList.toggle('admin-mode', isAdmin);
}

// ========== dnd + удаление/перемещение через Фаербейс =========
function enableDnD(tab, playersTab) {
  let droppedInTier = false;
  document.querySelectorAll('.player').forEach(playerEl => {
    playerEl.setAttribute('draggable', isAdmin ? 'true' : 'false');
    playerEl.ondragstart = null;
    playerEl.ondragend = null;
  });
  document.querySelectorAll('.players-list').forEach(listEl=>{
    listEl.ondragover = null;
    listEl.ondrop = null;
    listEl.ondragenter = null;
    listEl.ondragleave = null;
    listEl.parentNode.classList.remove('drag-over');
  });
  document.body.ondragover = null;
  document.body.ondrop = null;
  if (!isAdmin) return;
  document.querySelectorAll('.player').forEach(playerEl => {
    playerEl.ondragstart = function(e) {
      draggedName = this.getAttribute('data-name');
      draggedType = this.getAttribute('data-type');
      draggedId = this.getAttribute('data-id');
      let matchTier = this.parentElement.id.match(/(kitpvp|nezerpot)-tier(\d)/);
      if (matchTier) draggedFromTier = [matchTier[1], matchTier[2]];
      setTimeout(()=>{ this.classList.add('dragging'); },0);
      droppedInTier = false;
    };
    playerEl.ondragend = function(e) {
      this.classList.remove('dragging');
      // если не дропнули никуда — удалить игрока из базы
      if (draggedName && draggedType && draggedFromTier && !droppedInTier) {
        let [tab, tier] = draggedFromTier;
        if (draggedId) deletePlayerFromBase(tab, draggedId);
      }
      draggedName = null; draggedType = null; draggedFromTier = null; draggedId = null; droppedInTier = false;
    };
  });
  document.querySelectorAll('.players-list').forEach(listEl=>{
    listEl.ondragover = function(e) {
      e.preventDefault();
      if (!isAdmin) return;
      this.parentNode.classList.add('drag-over');
    };
    listEl.ondragleave = function(e) {
      this.parentNode.classList.remove('drag-over');
    };
    listEl.ondrop = function(e) {
      e.preventDefault();
      this.parentNode.classList.remove('drag-over');
      droppedInTier = true;
      if (!draggedName || !draggedType || !draggedFromTier) return;
      let matchTo = this.id.match(/(kitpvp|nezerpot)-tier(\d)/);
      let toTab = matchTo[1], toTier = matchTo[2];
      let [fromTab, fromTier] = draggedFromTier;
      if (toTab !== fromTab) return;
      if (fromTier === toTier) return;
      // удаляем старого
      if (draggedId) deletePlayerFromBase(toTab, draggedId);
      // добавляем в новый tier
      addPlayerToBase(toTab, draggedName, toTier, draggedType);
    }
  });
  document.body.ondragover = function(e){ e.preventDefault(); };
  document.body.ondrop = function(e) {
    if (!e.target.closest('.tier')) droppedInTier = false;
  };
}

function disableDnDForGuests() {
  if (!isAdmin) {
    document.querySelectorAll('.player').forEach(playerEl => {
      playerEl.removeAttribute('draggable');
      playerEl.ondragstart = null;
      playerEl.ondragend = null;
    });
    document.querySelectorAll('.players-list').forEach(listEl=>{
      listEl.ondragover = null;
      listEl.ondrop = null;
      listEl.ondragenter = null;
      listEl.ondragleave = null;
      listEl.parentNode.classList.remove('drag-over');
    });
    document.body.ondragover = null;
    document.body.ondrop = null;
  }
}

// ========= добавление игрока ==========
window.addPlayer = function(tab) {
  if (!isAdmin) return;
  let name = document.getElementById(tab+'-player-name').value.trim();
  let tier = document.getElementById(tab+'-player-tier').value;
  let type = document.getElementById(tab+'-player-type').value;
  if(!name) return;
  addPlayerToBase(tab, name, tier, type); // только в базу!
  document.getElementById(tab+'-player-name').value = '';
};

// ========== остальная авторизация =======
window.checkPassword = async function() {
  const pass = document.getElementById('auth-password').value;
  const hash = await hashPassword(pass);
  if(hash === ADMIN_PASSWORD_HASH) {
    isAdmin = true;
    localStorage.setItem('isAdmin', '1');
    document.getElementById('auth-modal').style.display = 'none';
    updateAddForms(); updateAuthUI();
  } else {
    document.getElementById('auth-error').textContent = "Неверный пароль";
  }
};
function logout() {
  isAdmin = false;
  localStorage.removeItem('isAdmin');
  updateAddForms(); updateAuthUI();
}
window.logout = logout;
window.showAuthModal = function() {
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('auth-password').value = "";
  document.getElementById('auth-error').textContent = "";
};
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
document.addEventListener('click', function(e) {
  if (e.target === document.getElementById('auth-modal'))
    document.getElementById('auth-modal').style.display = "none";
});
document.addEventListener('keydown', function(e) {
  if (
    document.getElementById('auth-modal').style.display !== "none" &&
    (e.key === "Enter" || e.keyCode === 13)
  ) {
    checkPassword();
  }
});
// ==== clipboard ======
document.addEventListener('DOMContentLoaded', function() {
  // subscribe на обе вкладки!
  subscribePlayers('kitpvp', function(playersKitpvp) {
    if (currentTab === 'kitpvp') render('kitpvp', playersKitpvp);
  });
  subscribePlayers('nezerpot', function(playersNezerpot) {
    if (currentTab === 'nezerpot') render('nezerpot', playersNezerpot);
  });
  const address = document.getElementById('copy-address');
  if(address) {
    address.addEventListener('click', function() {
      navigator.clipboard.writeText(address.textContent);
      address.textContent = "Скопировано!";
      setTimeout(() => address.textContent = "play.envyworld.gg", 1200);
    });
  }
  document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('player')) {
      const name = e.target.getAttribute('data-name');
      if (name) {
        navigator.clipboard.writeText(name);
      }
    }
  });
});
