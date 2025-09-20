// Global mail list - initialized properly
let mailList = [];

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "shareToJobEmail",
      title: "Share to Job Email",
      contexts: ["selection"]
    });
  } catch (error) {
    console.error('Failed to create context menu:', error);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "shareToJobEmail") {
    try {
      // Check if user is authenticated first
      chrome.storage.local.get(['Apikey'], function(result) {
        try {
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
        } catch (error) {
          console.error('Error in storage callback:', error);
        }
      });
    } catch (error) {
      console.error('Error handling context menu click:', error);
    }
  }
});

// Utility functions
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        } catch (error) {
          reject(new Error('Failed to process file data'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });
}

function arrayBufferToBase64(buffer) {
  try {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (error) {
    console.error('Error converting array buffer to base64:', error);
    throw error;
  }
}

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['Apikey'], (result) => {
      resolve(result.Apikey || null);
    });
  });
}

// Message listener for various actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === "checkAuthStatus") {
      chrome.storage.local.get(['Apikey', 'userInfo'], function(result) {
        try {
          sendResponse({
            authenticated: !!(result.Apikey && result.userInfo),
            userInfo: result.userInfo || null
          });
        } catch (error) {
          console.error('Error checking auth status:', error);
          sendResponse({ authenticated: false, error: error.message });
        }
      });
      return true; 
    }

    if (request.action === "getMailList") {
      getMailList()
        .then((mailList) => {
          sendResponse({ mailList });
        })
        .catch((error) => {
          console.error('Error getting mail list:', error);
          sendResponse({ mailList: [], error: error.message });
        });
      return true;
    }

    if (request.action === "deleteMail") {
      deleteMail(request.mailId)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Error deleting mail:', error);
          sendResponse({ success: false, error: error.message });
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
            await addMail(data);
          } catch (parseError) {
            console.error('Failed to parse JSON:', parseError, 'Raw response:', text);
            // Continue with empty data object
          }

          sendResponse({ success: response.ok, data });
        } catch (error) {
          console.error('Fetch Error:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();

      return true;
    }
    
    if (request.action === "sendEmailViaGmail") {
      (async () => {
        try {
          // Use getAccessTokenInteractive specifically for Gmail API
          const token = await getAccessTokenInteractive(true);
          if (!token) {
            console.error("No Gmail access token found. Please log in again.");
            sendResponse({ success: false, error: "Unauthorized: No Gmail access token" });
            return;
          }

          let attachments = [];
          
          // Check if an attachment was sent from the popup
          if (request.emailData.attachments && request.emailData.attachments.length > 0) {
            try {
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
            } catch (attachmentError) {
              console.error('Error processing attachment:', attachmentError);
              // Continue without attachment
            }
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
      
      return true;
    }
  } catch (error) {
    console.error('Error in message listener:', error);
    sendResponse({ success: false, error: error.message });
  }
});

// Function to send email via Gmail API
async function sendGmailEmail(token, emailData) {
  try {
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

    // Add attachments
    for (const att of attachments) {
      try {
        const base64Data = att.data.replace(/(.{76})/g, "$1\r\n");
        mimeParts.push(
          ``,
          `--${boundary}`,
          `Content-Type: ${att.mimeType}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          `Content-Transfer-Encoding: base64`,
          ``,
          base64Data
        );
      } catch (attachmentError) {
        console.error('Error processing attachment in MIME:', attachmentError);
        // Continue with other attachments
      }
    }

    // Closing boundary
    mimeParts.push(``, `--${boundary}--`);

    const mimeMessage = mimeParts.join("\r\n");

    // Encode email for Gmail API
    const encodedEmail = btoa(unescape(encodeURIComponent(mimeMessage)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send email via Gmail API
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
    
    const result = await response.json();
    console.log("Send response:", result);

    // Fetch full Gmail message to verify attachment
    try {
      const messageId = result.id;
      const fullResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (fullResponse.ok) {
        const fullMessage = await fullResponse.json();
        console.log("Full Gmail Message:", fullMessage);
        return { result, fullMessage };
      } else {
        console.warn('Failed to fetch full message, returning basic result');
        return { result };
      }
    } catch (fetchError) {
      console.error('Error fetching full message:', fetchError);
      return { result }; // Return basic result if full fetch fails
    }
    
  } catch (error) {
    console.error('Gmail API Error:', error);
    throw error;
  }
}

// Monitor authentication status
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    try {
      chrome.storage.local.get(['userToken', 'Apikey'], (result) => {
        try {
          if (result.userToken && result.Apikey) {
            // User logged in, switch to main popup
            chrome.action.setPopup({ popup: 'popup.html' });
          } else {
            // User logged out, switch to auth popup
            chrome.action.setPopup({ popup: 'auth.html' });
          }
        } catch (error) {
          console.error('Error setting popup based on auth status:', error);
        }
      });
    } catch (error) {
      console.error('Error in storage change listener:', error);
    }
  }
});

// Initialize popup based on auth status
chrome.runtime.onStartup.addListener(() => {
  try {
    chrome.storage.local.get(['userToken', 'Apikey'], function(result) {
      try {
        if (result.userToken && result.Apikey) {
          chrome.action.setPopup({ popup: 'popup.html' });
        } else {
          chrome.action.setPopup({ popup: 'auth.html' });
        }
      } catch (error) {
        console.error('Error setting initial popup:', error);
      }
    });
  } catch (error) {
    console.error('Error in startup listener:', error);
  }
});

// Get access token with proper error handling
function getAccessTokenInteractive(interactive = true) {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.getAuthToken({ interactive }, function(token) {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError || new Error("Failed to get access token"));
        } else {
          try {
            // Save token for future use
            chrome.storage.local.set({ userToken: token });
            resolve(token);
          } catch (storageError) {
            console.error('Error saving token:', storageError);
            resolve(token); // Still resolve with token even if storage fails
          }
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Mail management functions
async function addMail(data) {
  try {
    if (!data || !data.id || !data.model) {
      console.warn('Invalid mail data provided:', data);
      return;
    }

    const jobDetails = {
      id: data.id,
      subject: data.model.subject,
      body: data.model.body,
      recipient_mail: data.model.recipient_mail,
      company_name: data.model.company_name,
      location: data.model.location,
      techstack: data.model.techstack
    };

    // Get current mail list from storage to ensure consistency
    const currentMailList = await getMailList();
    currentMailList.push(jobDetails);
    mailList = currentMailList;
    
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ mailList }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Error adding mail:', error);
    throw error;
  }
}

async function getMailList() {
  try {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['mailList'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          const retrievedList = result.mailList || [];
          mailList = retrievedList; // Update global variable
          resolve(retrievedList);
        }
      });
    });
  } catch (error) {
    console.error('Error getting mail list:', error);
    throw error;
  }
}

async function deleteMail(id) {
  try {
    // Get current mail list to ensure consistency
    const currentMailList = await getMailList();
    const index = currentMailList.findIndex(mail => mail.id === id);
    
    if (index !== -1) {
      currentMailList.splice(index, 1);
      mailList = currentMailList;
      
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ mailList }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    } else {
      console.warn('Mail with ID not found:', id);
    }
  } catch (error) {
    console.error('Error deleting mail:', error);
    throw error;
  }
}