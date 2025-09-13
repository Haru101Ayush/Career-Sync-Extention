// Authentication script for Job Email Helper extension
const baseurl="https://ridgelike-katina-kissably.ngrok-free.app"
function authenticateWithGoogle() {
  chrome.identity.getAuthToken({ interactive: true }, function(token) {
    if (chrome.runtime.lastError) {
      console.error("Failed to get token:", chrome.runtime.lastError);
      alert("Authentication failed: " + chrome.runtime.lastError.message);
      return;
    }

    console.log("OAuth Token:", token);
    // You can now use the token to call Gmail API or Google user info
    fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((userInfo) => {
        console.log("User Info:", userInfo);
        document.getElementById("status").innerText = `Logged in as ${userInfo.email}`;
      })
      .catch((err) => {
        console.error("Error fetching user info:", err);
        alert("Failed to get user info");
      });
  });
}

document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    setupEventListeners();
});

// Check if user is already authenticated
function checkAuthStatus() {
    chrome.storage.local.get(['userToken', 'userInfo'], function(result) {
        if (result.userToken && result.userInfo) {
            showUserInfo(result.userInfo);
        } else {
            showAuthSection();
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('googleSignIn').addEventListener('click', initiateGoogleAuth);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('continueBtn').addEventListener('click', continueToApp);
}

// Show authentication section
function showAuthSection() {
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
}

// Show user information section
function showUserInfo(userInfo) {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('userInfo').style.display = 'block';
    document.getElementById('loading').style.display = 'none';
    
    // Populate user information
    document.getElementById('userAvatar').src = userInfo.picture || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%23666"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    document.getElementById('userName').textContent = userInfo.name || 'User';
    document.getElementById('userEmail').textContent = userInfo.email || '';
}

// Show loading state
function showLoading(show) {
    if (show) {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
    } else {
        document.getElementById('loading').style.display = 'none';
    }
}

// Show status message
function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 5000);
}

// Initiate Google OAuth authentication
function initiateGoogleAuth() {
    showLoading(true);
    
    // Check if the OAuth2 configuration exists
    if (!chrome.runtime.getManifest().oauth2) {
        showLoading(false);
        showStatus('OAuth configuration not found. Please check manifest.json', 'error');
        return;
    }
    
    // Launch the OAuth flow
    chrome.identity.getAuthToken({ 
        interactive: true,
        scopes: [
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ]
    }, function(token) {
        showLoading(false);
        
        if (chrome.runtime.lastError) {
            console.error('OAuth Error:', chrome.runtime.lastError);
            showStatus('Authentication failed: ' + chrome.runtime.lastError.message, 'error');
            showAuthSection();
            return;
        }
        
        if (token) {
            // Store the token
            chrome.storage.local.set({ userToken: token });
            
            // Fetch user information
            fetchUserInfo(token);
        } else {
            showStatus('Authentication cancelled or failed', 'error');
            showAuthSection();
        }
    });
}

// Fetch user information from Google API
function fetchUserInfo(token) {
    fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch user info');
        }
        return response.json();
    })
    .then(userInfo => {
        // Store user information
        chrome.storage.local.set({ 
            //api call
            userInfo: userInfo,
            authTimestamp: Date.now()
        });

        fetch(`${baseurl}/api/Auth/google`, {  
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userInfo)   
        })
        .then(apiResponse => {
            if (!apiResponse.ok) {
                throw new Error('Failed to save user info to backend');
            }
            return apiResponse.json();
        })
       .then(result => {
    console.log('Backend response:', result);


    if (result.token) {
        chrome.storage.local.set({ userToken: result.token }, () => {
            console.log("Token saved in local storage:", result.token);
        });
    }

       chrome.storage.local.get("userInfo", ({ userInfo }) => {
            showUserInfo(userInfo);
        });
        showStatus('Successfully authenticated with Google!', 'success');
            // Send message to content script (e.g., Gmail tab)
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "openPopupWindow" });
        }
    });

    })
    .catch(error => {
        console.error('Error fetching user info:', error);
        showStatus('Failed to fetch user information', 'error');
        showAuthSection();
    });
})
.catch(error => {
        console.error('Error fetching user info:', error);
        showStatus('Failed to fetch user information', 'error');
        showAuthSection();
    });
}

// Logout function
function logout() {
    // Get the current token
    chrome.storage.local.get(['userToken'], function(result) {
        if (result.userToken) {
            // Revoke the token
            chrome.identity.removeCachedAuthToken({ token: result.userToken }, function() {
                // Clear stored data
                chrome.storage.local.remove(['userToken', 'userInfo', 'authTimestamp'], function() {
                    showAuthSection();
                    showStatus('Successfully signed out', 'success');
                });
            });
        } else {
            // Clear stored data even if no token
            chrome.storage.local.remove(['userToken', 'userInfo', 'authTimestamp'], function() {
                showAuthSection();
                showStatus('Successfully signed out', 'success');
            });
        }
    });
}

// Continue to main app
function continueToApp() {
    // Check if user is authenticated
    chrome.storage.local.get(['userToken', 'userInfo'], function(result) {
        if (result.userToken && result.userInfo) {
            // Redirect to popup.html by changing the popup URL
            chrome.action.setPopup({ popup: 'popup.html' });
            
            // Close current popup and open the main app
            window.close();
            
            // Open the main popup
            setTimeout(() => {
                chrome.action.openPopup();
            }, 100);
        } else {
            showStatus('Please authenticate first', 'error');
        }
    });
}

// Utility function to check token validity
function isTokenValid(callback) {
    chrome.storage.local.get(['userToken', 'authTimestamp'], function(result) {
        if (!result.userToken || !result.authTimestamp) {
            callback(false);
            return;
        }
        
        // Check if token is older than 1 hour (basic check)
        const tokenAge = Date.now() - result.authTimestamp;
        const oneHour = 60 * 60 * 1000;
        
        if (tokenAge > oneHour) {
            // Test the token with a simple API call
            fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${result.userToken}`
                }
            })
            .then(response => {
                callback(response.ok);
            })
            .catch(() => {
                callback(false);
            });
        } else {
            callback(true);
        }
    });
}

// Auto-refresh token if needed
function refreshTokenIfNeeded() {
    isTokenValid(function(valid) {
        if (!valid) {
            // Clear invalid token and show auth section
            chrome.storage.local.remove(['userToken', 'userInfo', 'authTimestamp']);
            showAuthSection();
            showStatus('Session expired. Please sign in again.', 'error');
        }
    });
}

// Check token validity on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(refreshTokenIfNeeded, 1000);
});













