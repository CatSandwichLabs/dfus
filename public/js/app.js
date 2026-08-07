const API_BASE = '/api/v1';

const contentDiv = document.getElementById('content');

const views = {
  home: () => `
    <div class="card">
      <h2>Welcome to DFUS</h2>
      <p>A highly scalable, distributed file upload system.</p>
    </div>
  `,
  login: () => `
    <div class="card" style="max-width: 400px; margin: 0 auto;">
      <h2>Login</h2>
      <form id="loginForm">
        <input type="email" id="email" placeholder="Email" required>
        <input type="password" id="password" placeholder="Password" required>
        <button type="submit">Login</button>
      </form>
    </div>
  `,
  register: () => `
    <div class="card" style="max-width: 400px; margin: 0 auto;">
      <h2>Register</h2>
      <form id="registerForm">
        <input type="email" id="email" placeholder="Email" required>
        <input type="password" id="password" placeholder="Password" required>
        <button type="submit">Register</button>
      </form>
    </div>
  `,
  dashboard: () => `
    <div class="card">
      <h2>Dashboard</h2>
      <p>Welcome back! Here are your files:</p>
      <div id="fileList">Loading...</div>
      
      <hr>
      <h3>Upload File</h3>
      <input type="file" id="fileInput">
      <button onclick="uploadFile()">Upload</button>
    </div>
  `
};

function router() {
  const hash = window.location.hash.slice(1) || '/';
  
  if (hash === '/') contentDiv.innerHTML = views.home();
  else if (hash === '/login') {
    contentDiv.innerHTML = views.login();
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
  }
  else if (hash === '/register') {
    contentDiv.innerHTML = views.register();
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
  }
  else if (hash === '/dashboard') {
    contentDiv.innerHTML = views.dashboard();
    fetchFiles();
  }
  else contentDiv.innerHTML = '<h2>404 Not Found</h2>';
  
  updateNav();
}

function updateNav() {
  const token = localStorage.getItem('token');
  if (token) {
    document.getElementById('nav-login').style.display = 'none';
    document.getElementById('nav-register').style.display = 'none';
    document.getElementById('nav-dashboard').style.display = 'inline';
    document.getElementById('nav-logout').style.display = 'inline';
  } else {
    document.getElementById('nav-login').style.display = 'inline';
    document.getElementById('nav-register').style.display = 'inline';
    document.getElementById('nav-dashboard').style.display = 'none';
    document.getElementById('nav-logout').style.display = 'none';
  }
}

document.getElementById('nav-logout').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('token');
  window.location.hash = '/login';
});

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      window.location.hash = '/dashboard';
    } else {
      alert(data.error);
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Registration successful. Please log in.');
      window.location.hash = '/login';
    } else {
      alert(data.error);
    }
  } catch (err) {
    console.error(err);
  }
}

async function fetchFiles() {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  try {
    const res = await fetch(`${API_BASE}/folders/root`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      const fileList = document.getElementById('fileList');
      if (data.files && data.files.length > 0) {
        fileList.innerHTML = '<ul>' + data.files.map(f => `<li>${f.originalName} (${f.size} bytes)</li>`).join('') + '</ul>';
      } else {
        fileList.innerHTML = '<p>No files found.</p>';
      }
    }
  } catch (err) {
    console.error(err);
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
