

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
    chrome.storage.local.get(['Apikey'], function(result) {
      if (!result.Apikey) {
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
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function getToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['Apikey'], (result) => {
            resolve(result.Apikey || null);
        });
    });
}



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkAuthStatus") {
    chrome.storage.local.get(['Apikey', 'userInfo'], function(result) {
      sendResponse({
        authenticated: !!(result.Apikey && result.userInfo),
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
  
  if (request.action === "sendEmailViaGmail") {
    (async () => {
      try {
        // Use getAccessTokenInteractive specifically for Gmail API
        // This ensures we get a token with the right scopes for Gmail
        const token = await getAccessTokenInteractive(true);
        if (!token) {
          console.error("No Gmail access token found. Please log in again.");
          sendResponse({ success: false, error: "Unauthorized: No Gmail access token" });
          return;
        }
       let attachments = [];
        // Check if an attachment was sent from the popup
        if (request.emailData.attachments && request.emailData.attachments.length > 0) {
          const { name, type, data } = request.emailData.attachments[0];
          
          // Convert the array of numbers back to a Uint8Array
          const fileData = new Uint8Array(data);
          // Convert the Uint8Array to a Base64 string
          const base64Data = arrayBufferToBase64(fileData);
          
          attachments.push({
            filename: name,
            mimeType: type,
            data: base64Data
          });
        }

        const finalEmailData = {
          to: request.emailData.to,
          subject: request.emailData.subject,
          body: request.emailData.body,
          isHtml: request.emailData.isHtml,
          attachments: attachments
        };

        // Call the sendGmailEmail function with the Gmail token and email data
        const result = await sendGmailEmail(token, finalEmailData);
        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error('Gmail API Error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    // Return true to indicate async response
    return true;
  }
});


// Function to send email via Gmail API
async function sendGmailEmail(token, emailData) {
  const { to, subject, body, isHtml, attachments = [] } = emailData;
  const boundary = "foo_bar_baz_" + Date.now();

  // Base part (body)
  let mimeParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: ${isHtml ? 'text/html; charset="UTF-8"' : 'text/plain; charset="UTF-8"'}`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    body
  ];

  for (const att of attachments) {
      const base64Data =  att.data.replace(/(.{76})/g, "$1\r\n");
       mimeParts.push(
      ``,
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
     base64Data
    );
  }

  // Closing boundary
  mimeParts.push(``, `--${boundary}--`);


  const mimeMessage = mimeParts.join("\r\n");

  const encodedEmail = btoa(unescape(encodeURIComponent(mimeMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
    
    // return await response.json();
    const result = await response.json();
    console.log("Send response:", result);

    // Fetch full Gmail message to verify attachment
    const messageId = result.id;
    const fullResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const fullMessage = await fullResponse.json();
    console.log("Full Gmail Message:", fullMessage);

    return { result, fullMessage }; // return both
    
  } catch (error) {
    console.error('Gmail API Error:', error);
    throw error;
  }
}

// Monitor authentication status
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    chrome.storage.local.get(['userToken', 'Apikey'], (result) => {
    if (result.userToken && result.Apikey) {
      // User logged in, switch to main popup
      chrome.action.setPopup({ popup: 'popup.html' });
    } else {
      // User logged out, switch to auth popup
      chrome.action.setPopup({ popup: 'auth.html' });
    }
  });
  }
});

// Initialize popup based on auth status
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['userToken', 'Apikey'], function(result) {
    if (result.userToken && result.Apikey) {
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
