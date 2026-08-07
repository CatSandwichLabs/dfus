// For Cloudflare Pages, set this to your VPS backend URL (e.g., 'https://api.yourdomain.com')
// For local testing, keep it empty to use relative paths
const API_BASE = window.location.hostname === 'localhost' ? '' : 'https://YOUR_VPS_IP:3000';

class ApiClient {
    constructor(baseUrl = '/api') {
        this.baseUrl = API_BASE + baseUrl;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Use Firebase Auth ID token if available
        let token = null;
        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
            token = await firebase.auth().currentUser.getIdToken();
            localStorage.setItem('dfus_token', token);
        } else {
            token = localStorage.getItem('dfus_token');
        }

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    // Firebase handles its own tokens. If 401, the user is just logged out.
                    this.logout();
                }
                throw new Error(data.error?.message || data.message || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    post(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    // For FormData (file uploads)
    postForm(endpoint, formData, options = {}) {
        // Remove Content-Type to let browser set boundary
        const headers = { ...options.headers };
        delete headers['Content-Type'];
        
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: formData,
            headers
        });
    }

    delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }

    logout() {
        if (typeof firebase !== 'undefined') {
            firebase.auth().signOut();
        }
        localStorage.removeItem('dfus_token');
        localStorage.removeItem('dfus_user');
        window.location.href = 'index.html';
    }
}

window.api = new ApiClient();
