// Configurable local server endpoint
const API_URL = 'http://localhost:3000/entries';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('clip-form');
  const titleInput = document.getElementById('title');
  const urlInput = document.getElementById('url');
  const typeSelect = document.getElementById('type');
  const contentInput = document.getElementById('content');
  const tokenInput = document.getElementById('token');
  const saveBtn = document.getElementById('save-btn');
  const statusDiv = document.getElementById('status');
  const authToggle = document.getElementById('auth-toggle');
  const authSection = document.getElementById('auth-section');

  let activeToken = '';

  // 1. Fetch current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs && tabs[0]) {
      const activeTab = tabs[0];
      titleInput.value = activeTab.title || '';
      urlInput.value = activeTab.url || '';

      // Check if this tab is a local client dashboard
      if (activeTab.url && activeTab.url.includes('localhost:5173')) {
        typeSelect.value = 'note'; // default local to note
      }

      // Try executing script to get page selection text
      try {
        chrome.scripting.executeScript(
          {
            target: { tabId: activeTab.id },
            func: () => window.getSelection().toString(),
          },
          (results) => {
            if (results && results[0] && results[0].result) {
              contentInput.value = results[0].result;
              // If there is selection text, default type to snippet or note
              if (results[0].result.length > 50) {
                typeSelect.value = 'note';
              } else {
                typeSelect.value = 'snippet';
              }
            }
          }
        );
      } catch (err) {
        console.warn('Cannot run selection grab on this page type.');
      }
    }
  });

  // 2. Discover local storage token on localhost:5173
  const discoveredToken = await findLocalAuthToken();
  if (discoveredToken) {
    activeToken = discoveredToken;
    tokenInput.value = discoveredToken;
    showStatus('Connected & authenticated via active tab session!', 'success');
  } else {
    // Check extension local storage fallback
    chrome.storage.local.get(['jwt_token'], (res) => {
      if (res.jwt_token) {
        activeToken = res.jwt_token;
        tokenInput.value = res.jwt_token;
      } else {
        showStatus('No active authentication found. Please open KnowledgeHub or paste token.', 'error');
        authSection.style.display = 'block';
      }
    });
  }

  // Toggle auth panel
  authToggle.addEventListener('click', () => {
    const isVisible = authSection.style.display === 'block';
    authSection.style.display = isVisible ? 'none' : 'block';
  });

  // 3. Form Submit save logic
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusDiv.style.display = 'none';

    const tokenToUse = tokenInput.value.trim() || activeToken;
    if (!tokenToUse) {
      showStatus('Auth token is required. Paste one in the settings section.', 'error');
      authSection.style.display = 'block';
      return;
    }

    // Save token for future use
    chrome.storage.local.set({ jwt_token: tokenToUse });

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving entry...';

    try {
      const payload = {
        title: titleInput.value.trim(),
        url: urlInput.value.trim(),
        type: typeSelect.value,
        content: contentInput.value.trim(),
        tag_ids: [],
        collection_id: null,
        is_pinned: false,
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error ${response.status}`);
      }

      showStatus('Saved successfully to KnowledgeHub!', 'success');
      setTimeout(() => {
        window.close(); // Close extension popup automatically
      }, 1500);
    } catch (err) {
      console.error(err);
      showStatus(`Save failed: ${err.message || 'Server connection refused'}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save to KnowledgeHub';
    }
  });

  function showStatus(msg, type) {
    statusDiv.textContent = msg;
    statusDiv.className = type === 'success' ? 'status-success' : 'status-error';
    statusDiv.style.display = 'block';
  }

  async function findLocalAuthToken() {
    return new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        const clientTab = tabs.find((t) => t.url && t.url.includes('localhost:5173'));
        if (clientTab) {
          chrome.scripting.executeScript(
            {
              target: { tabId: clientTab.id },
              func: () => {
                // Search localStorage keys for Supabase auth token
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    try {
                      const data = JSON.parse(localStorage.getItem(key));
                      return data?.access_token || null;
                    } catch (e) {}
                  }
                }
                return null;
              },
            },
            (results) => {
              if (results && results[0] && results[0].result) {
                resolve(results[0].result);
              } else {
                resolve(null);
              }
            }
          );
        } else {
          resolve(null);
        }
      });
    });
  }
});
