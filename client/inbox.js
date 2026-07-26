document.addEventListener('DOMContentLoaded', () => {
  const btnCreate = document.getElementById('btn-create-inbox');
  const btnLogin = document.getElementById('btn-login-inbox');
  const createId = document.getElementById('create-id');
  const createPass = document.getElementById('create-pass');
  const loginId = document.getElementById('login-id');
  const loginPass = document.getElementById('login-pass');
  const authPanel = document.getElementById('auth-panel');
  const dashboardPanel = document.getElementById('dashboard-panel');
  const inboxTitle = document.getElementById('inbox-title');
  const tbody = document.getElementById('inbox-table-body');
  const statusMsg = document.getElementById('auth-status');

  async function createInbox() {
    statusMsg.textContent = 'Creating...';
    statusMsg.style.color = 'var(--text-secondary)';
    
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/inbox/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxId: createId.value.trim(), password: createPass.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      statusMsg.textContent = 'Success! You can now login.';
      statusMsg.style.color = 'var(--success)';
      createId.value = '';
      createPass.value = '';
    } catch (err) {
      statusMsg.textContent = err.message;
      statusMsg.style.color = 'var(--error)';
    }
  }

  async function loginInbox() {
    statusMsg.textContent = 'Logging in...';
    statusMsg.style.color = 'var(--text-secondary)';
    
    try {
      const id = loginId.value.trim();
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/inbox/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxId: id, password: loginPass.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      
      // Success
      authPanel.style.display = 'none';
      dashboardPanel.style.display = 'block';
      inboxTitle.textContent = `Inbox: ${id}`;
      renderTable(data.files);
    } catch (err) {
      statusMsg.textContent = err.message;
      statusMsg.style.color = 'var(--error)';
    }
  }

  function renderTable(files) {
    tbody.innerHTML = '';
    if (!files || files.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">Inbox is empty.</td></tr>';
      return;
    }
    
    files.forEach(f => {
      const tr = document.createElement('tr');
      const shareUrl = `${window.location.origin}/download.html?id=${f.shareId}`;
      const sizeStr = (f.sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
      
      tr.innerHTML = `
        <td>${new Date(f.createdAt).toLocaleString()}</td>
        <td><strong>${f.originalName}</strong></td>
        <td>${sizeStr}</td>
        <td>
          <a href="${shareUrl}" target="_blank" class="btn btn-primary" style="padding: 4px 12px; font-size: 0.8rem; text-decoration: none;">Download</a>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (btnCreate) btnCreate.addEventListener('click', createInbox);
  if (btnLogin) btnLogin.addEventListener('click', loginInbox);
});
