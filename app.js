const CONFIG = {
    GOOGLE_CLIENT_ID: '472260001788-4i96qjsbjr8opl2b3qb1sun41embmmnl.apps.googleusercontent.com',
    API_BASE_URL: 'https://trade-tracker-api.alextrades.workers.dev'
};

let idToken = null;
let selectedFile = null;

window.onload = function() {
    initGoogleSignIn();
    initDragAndDrop();
    document.getElementById('file-input').addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
};

function initGoogleSignIn() {
    google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: true
    });
    google.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'rectangular' }
    );
}

function handleCredentialResponse(response) {
    idToken = response.credential;
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    document.getElementById('user-email').textContent = payload.email;
    document.getElementById('google-signin-button').classList.add('hidden');
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('upload-section').classList.remove('hidden');
    document.getElementById('login-prompt').classList.add('hidden');
}

function signOut() {
    google.accounts.id.disableAutoSelect();
    idToken = null;
    selectedFile = null;
    document.getElementById('google-signin-button').classList.remove('hidden');
    document.getElementById('user-info').classList.add('hidden');
    document.getElementById('upload-section').classList.add('hidden');
    document.getElementById('login-prompt').classList.remove('hidden');
    clearPreview();
    google.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'rectangular' }
    );
}

function initDragAndDrop() {
    const dz = document.getElementById('drop-zone');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => { dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', (e) => {
        e.preventDefault(); dz.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0 && e.dataTransfer.files[0].type.startsWith('image/'))
            handleFile(e.dataTransfer.files[0]);
    });
    dz.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL')
            document.getElementById('file-input').click();
    });
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) { showError('File too large. Max 10MB.'); return; }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-image').src = e.target.result;
        document.getElementById('drop-zone').classList.add('hidden');
        document.getElementById('preview-section').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    document.getElementById('result').innerHTML = '';
}

function clearPreview() {
    selectedFile = null;
    document.getElementById('preview-image').src = '';
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('drop-zone').classList.remove('hidden');
    document.getElementById('result').innerHTML = '';
    document.getElementById('file-input').value = '';
}

async function submitScreenshot() {
    if (!selectedFile || !idToken) return;
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('result').innerHTML = '';
    document.getElementById('submit-btn').disabled = true;
    try {
        const base64 = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(',')[1]);
            r.onerror = reject;
            r.readAsDataURL(selectedFile);
        });
        const resp = await fetch(CONFIG.API_BASE_URL + '/api/extract-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
            body: JSON.stringify({ image: base64, mimeType: selectedFile.type })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'API error');
        if (data.success) {
            const t = data.trade;
            document.getElementById('result').innerHTML = '<div class="success"><h3>Trade Added Successfully!</h3><div class="trade-details">' +
                ['Symbol','Type','Action','Strike','Expiration','Quantity','Premium','Total'].map(k => {
                    const v = t[k.toLowerCase()];
                    const display = v != null ? (['strike','premium','total'].includes(k.toLowerCase()) ? '$'+v : v) : '-';
                    return '<div class="trade-item"><div class="label">'+k+'</div><div class="value">'+display+'</div></div>';
                }).join('') + '</div></div>';
            setTimeout(clearPreview, 3000);
        } else {
            showError(data.message || 'Could not extract trade data');
        }
    } catch (e) { showError(e.message); }
    finally {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('submit-btn').disabled = false;
    }
}

function showError(msg) {
    document.getElementById('result').innerHTML = '<div class="error"><strong>Error:</strong> ' + msg + '</div>';
}
