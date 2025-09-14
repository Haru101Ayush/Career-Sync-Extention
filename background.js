

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "shareToJobEmail",
    title: "Share to Job Email",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "shareToJobEmail") {
    // Check if user is authenticated first
    chrome.storage.local.get(['userToken'], function(result) {
      if (!result.userToken) {
        // User not authenticated, open auth popup
        chrome.action.setPopup({ popup: 'auth.html' });
        chrome.action.openPopup();
        return;
      }
      const profile_data = result.resumeSummary || '';

      // User is authenticated, proceed with normal flow
      const jobData = {
        selectedText: info.selectionText,
        pageUrl: tab.url,
        pageTitle: tab.title,
        timestamp: new Date().toISOString(),
         profile_data: profile_data 
      };
      
      // Store data for popup to access
      chrome.storage.local.set({ jobData: jobData });
      
      // Set popup to main app and open it
      chrome.action.setPopup({ popup: 'popup.html' });
      chrome.action.openPopup();
    });
  }
});

function getToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['userToken'], (result) => {
            resolve(result.userToken || null);
        });
    });
}



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkAuthStatus") {
    chrome.storage.local.get(['userToken', 'userInfo'], function(result) {
      sendResponse({
        authenticated: !!(result.userToken && result.userInfo),
        userInfo: result.userInfo || null
      });
    });
    return true; 
  }

  if (request.action === "sendToServer") {
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          console.error("No token found. Please log in again.");
          sendResponse({ success: false, error: "Unauthorized: No token" });
          return;
        }

        const response = await fetch(request.serverUrl, {
          method: 'POST',
          headers: {
            "Authorization": `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: request.data.url,
            message: request.data.message,
            title: request.data.title,
            profile_data: request.data.profile_data,
          })
        });

        const text = await response.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (err) {
          console.error('Failed to parse JSON:', err, 'Raw response:', text);
        }

        sendResponse({ success: response.ok, data });
      } catch (error) {
        console.error('Fetch Error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    // Return true to indicate async response
    return true;
  }
});


// Function to send email via Gmail API
async function sendGmailEmail(token, emailData) {
  const { to, subject, body, isHtml } = emailData;
  
  // Create email message in RFC 2822 format
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: ' + (isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'),
    '',
    body
  ].join('\r\n');
  
  // Encode email in base64url format
  const encodedEmail = btoa(email)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedEmail
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to send email');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Gmail API Error:', error);
    throw error;
  }
}

// Monitor authentication status
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.userToken) {
    if (changes.userToken.newValue) {
      // User logged in, switch to main popup
      chrome.action.setPopup({ popup: 'popup.html' });
    } else {
      // User logged out, switch to auth popup
      chrome.action.setPopup({ popup: 'auth.html' });
    }
  }
});

// Initialize popup based on auth status
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['userToken'], function(result) {
    if (result.userToken) {
      chrome.action.setPopup({ popup: 'popup.html' });
    } else {
      chrome.action.setPopup({ popup: 'auth.html' });
    }
  });
});

function getAccessTokenInteractive(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, function(token) {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error("Failed to get access token"));
      } else {
        // Save token for future use
        chrome.storage.local.set({ userToken: token });
        resolve(token);
      }
    });
  });
}
