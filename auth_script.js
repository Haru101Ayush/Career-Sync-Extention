/**
 * Authentication script for Career Sync Chrome extension
 * Handles Google OAuth authentication and user session management
 */

// API base URL
const BASE_URL = "https://ridgelike-katina-kissably.ngrok-free.app";

/**
 * Authenticates user with Google OAuth
 * @async
 */
const authenticateWithGoogle = async () => {
  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(token);
      });
    });

    // Fetch user info with the token
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const userInfo = await response.json();
    document.getElementById("status").innerText = `Logged in as ${userInfo.email}`;
    return { token, userInfo };
  } catch (error) {
    console.error("Authentication error:", error);
    showStatus(`Authentication failed: ${error.message}`, 'error');
    throw error;
  }
};

/**
 * Initialize the authentication page
 */
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupEventListeners();
});


/**
 * Check if user is authenticated and show appropriate UI
 */
const checkAuthStatus = () => {
  chrome.storage.local.get(['userToken', 'userInfo'], (result) => {
    if (result.userToken && result.userInfo) {
      showUserInfo(result.userInfo);
    } else {
      showAuthSection();
    }
  });
}

/**
 * Setup event listeners for the authentication page
 */
const setupEventListeners = () => {
  document.getElementById('googleSignIn').addEventListener('click', initiateGoogleAuth);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('continueBtn').addEventListener('click', continueToApp);
};

/**
 * Show authentication section and hide other sections
 */
const showAuthSection = () => {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('userInfo').style.display = 'none';
  document.getElementById('loading').style.display = 'none';
};

/**
 * Show user information section and populate with user data
 * @param {Object} userInfo - User information object from Google API
 */
const showUserInfo = (userInfo) => {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('userInfo').style.display = 'block';
  document.getElementById('loading').style.display = 'none';
  
  // Default avatar SVG as fallback
  const defaultAvatar = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%23666"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  
  // Populate user information
  document.getElementById('userAvatar').src = userInfo.picture || defaultAvatar;
    document.getElementById('userName').textContent = userInfo.name || 'User';
    document.getElementById('userEmail').textContent = userInfo.email || '';
}

/**
 * Show or hide loading state and adjust other UI elements accordingly
 * @param {boolean} show - Whether to show or hide the loading state
 */
const showLoading = (show) => {
  if (show) {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
  } else {
    document.getElementById('loading').style.display = 'none';
  }
};

/**
 * Show status message with auto-hide after timeout
 * @param {string} message - The message to display
 * @param {string} type - The type of message ('success', 'error', etc.)
 * @param {number} [timeout=5000] - Time in ms before hiding the message
 */
const showStatus = (message, type, timeout = 5000) => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  // Hide after specified timeout
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, timeout);
}

/**
 * Initiate Google OAuth authentication process
 * @async
 */
const initiateGoogleAuth = async () => {
  try {
    showLoading(true);
    
    // Check if the OAuth2 configuration exists
    if (!chrome.runtime.getManifest().oauth2) {
      throw new Error('OAuth configuration not found. Please check manifest.json');
    }
    
    // Define required scopes
    const scopes = [
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];
    
    // Launch the OAuth flow with Promise wrapper
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true, scopes }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!token) {
          reject(new Error('Authentication cancelled or failed'));
          return;
        }
        resolve(token);
      });
    });
    
    // Store the token
    await new Promise((resolve) => {
      chrome.storage.local.set({ userToken: token }, resolve);
    });
    
    // Fetch user information
    await fetchUserInfo(token);
  } catch (error) {
    console.error('Authentication error:', error);
    showStatus(`Authentication failed: ${error.message}`, 'error');
    showAuthSection();
  } finally {
    showLoading(false);
  }
}

/**
 * Fetch user information from Google API and register with backend
 * @async
 * @param {string} token - OAuth token
 * @returns {Promise<Object>} User information object
 */
const fetchUserInfo = async (token) => {
  try {
    // Fetch user info from Google API
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status}`);
    }
    
    const userInfo = await response.json();
    
    // Store user information locally
    await new Promise((resolve) => {
      chrome.storage.local.set({ 
        userInfo: userInfo,
        authTimestamp: Date.now()
      }, resolve);
    });

    // Register with backend
    const apiResponse = await fetch(`${BASE_URL}/api/Auth/google`, {  
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userInfo)   
    });
    
    if (!apiResponse.ok) {
      throw new Error(`Failed to save user info to backend: ${apiResponse.status}`);
    }
    
    const result = await apiResponse.json();
    console.log('Backend response:', result);
    
    // Save token if provided by backend
    if (result.token) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ userToken: result.token }, () => {
          console.log("Token saved in local storage:", result.token);
          resolve();
        });
      });
    }
    
    // Get user info and update UI
    const { userInfo: storedUserInfo } = await new Promise((resolve) => {
      chrome.storage.local.get("userInfo", (data) => resolve(data));
    });
    
    showUserInfo(storedUserInfo);
    showStatus('Successfully authenticated with Google!', 'success');
    
    // Send message to content script (e.g., Gmail tab)
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    
    if (tabs[0]) {
      try {
        chrome.tabs.sendMessage(tabs[0].id, { action: "openPopupWindow" });
      } catch (err) {
        console.warn("Could not send message:", err);
      }
    }
    
    return userInfo;
  } catch (error) {
    console.error('Error in fetchUserInfo:', error);
    showStatus(`Authentication failed: ${error.message}`, 'error');
    showAuthSection();
    throw error;
  }
}

/**
 * Log out the current user and clear authentication data
 * @async
 */
const logout = async () => {
  try {
    // Get the current token
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['userToken'], resolve);
    });
    
    if (result.userToken) {
      // Revoke the token
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: result.userToken }, resolve);
      });
    }
    
    // Clear stored data
    await new Promise((resolve) => {
      chrome.storage.local.remove(['userToken', 'userInfo', 'authTimestamp'], resolve);
    });
    
    showAuthSection();
    showStatus('Successfully signed out', 'success');
  } catch (error) {
    console.error('Logout error:', error);
    showStatus(`Logout failed: ${error.message}`, 'error');
  }
}

/**
 * Continue to the main application if authenticated
 * @async
 */
const continueToApp = async () => {
  try {
    // Check if user is authenticated
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['userToken', 'userInfo'], resolve);
    });
    
    if (result.userToken && result.userInfo) {
      // Redirect to popup.html by changing the popup URL
      await new Promise((resolve) => {
        chrome.action.setPopup({ popup: 'popup.html' }, resolve);
      });
      
      // Close current popup and open the main app
      window.close();
      
      // Open the main popup
      setTimeout(() => {
        chrome.action.openPopup();
      }, 100);
    } else {
      showStatus('Please authenticate first', 'error');
    }
  } catch (error) {
    console.error('Navigation error:', error);
    showStatus(`Failed to continue: ${error.message}`, 'error');
  }
}

/**
 * Check if the stored token is valid
 * @async
 * @returns {Promise<boolean>} True if token is valid, false otherwise
 */
const isTokenValid = async () => {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['userToken', 'authTimestamp'], resolve);
    });
    
    if (!result.userToken || !result.authTimestamp) {
      return false;
    }
    
    // Check if token is older than 1 hour (basic check)
    const tokenAge = Date.now() - result.authTimestamp;
    const oneHour = 60 * 60 * 1000;
    
    if (tokenAge > oneHour) {
      // Test the token with a simple API call
      try {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            'Authorization': `Bearer ${result.userToken}`
          }
        });
        return response.ok;
      } catch (error) {
        console.error('Token validation error:', error);
        return false;
      }
    } else {
      return true;
    }
  } catch (error) {
    console.error('Error checking token validity:', error);
    return false;
  }
};

/**
 * Auto-refresh token if needed or clear invalid tokens
 * @async
 */
const refreshTokenIfNeeded = async () => {
  try {
    const valid = await isTokenValid();
    if (!valid) {
      // Clear invalid token and show auth section
      await new Promise((resolve) => {
        chrome.storage.local.remove(['userToken', 'userInfo', 'authTimestamp'], resolve);
      });
      showAuthSection();
      showStatus('Session expired. Please sign in again.', 'error');
    }
  } catch (error) {
    console.error('Token refresh error:', error);
  }
};

// Check token validity on page load with a slight delay
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    await refreshTokenIfNeeded();
  }, 1000);
});













