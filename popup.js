// Popup JavaScript for Job Email Helper extension
const baseurl="https://ridgelike-katina-kissably.ngrok-free.app";
let isEditMode = false;

/**
 * Initialize the popup when DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await checkAuthStatus();
    await loadJobData();
    setupEventListeners();
    await loadSavedSettings();
    initResumeUpload();
    await displayTokenCount();
    setupDevModeToggle();
  } catch (error) {
    console.error('Error initializing popup:', error);
    showStatus('Failed to initialize popup', 'error');
  }
});

/**
 * Check if user is authenticated and handle authentication flow
 * @returns {Promise<boolean>} Authentication status
 */
async function checkAuthStatus() {
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'checkAuthStatus' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(response);
            });
        });
        
        if (!response.authenticated) {
            // Redirect to auth page
            await new Promise((resolve) => {
                chrome.action.setPopup({ popup: 'auth.html' }, resolve);
            });
            window.close();
            setTimeout(() => {
                chrome.action.openPopup();
            }, 100);
            return false;
        }
        
        // User is authenticated, show user info if available
        if (response.userInfo) {
            displayUserInfo(response.userInfo);
        }
        
        return true;
    } catch (error) {
        console.error('Authentication check failed:', error);
        showStatus('Authentication check failed', 'error');
        return false;
    }
}

/**
 * Send email via Gmail API
 * @returns {Promise<void>}
 */
async function sendViaGmail() {
    try {
        const jobDetailsStr = localStorage.getItem('jobDetails');
        const jobDetails = jobDetailsStr ? JSON.parse(jobDetailsStr) : null;

        if (!jobDetails) {
            showStatus('No job data available', 'error');
            return;
        }

        showLoading(true, 'Sending email via Gmail...');

        const emailData = {
            to: jobDetails.recipient_mail,
            subject: jobDetails.subject || 'No Subject',
            body: jobDetails.body || '',
            isHtml: false
        };

        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'sendEmailViaGmail',
                emailData: emailData
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(response);
            });
        });

        showLoading(false);

        if (response && response.success) {
            showStatus('Email sent successfully via Gmail!', 'success');
        } else {
            const errorMsg = response ? response.error : 'Failed to send email';
            showStatus(`Gmail Error: ${errorMsg}`, 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Gmail send error:', error);
        showStatus(`Gmail Error: ${error.message}`, 'error');
    }
}

/**
 * Get user token from storage
 * @returns {Promise<string|null>} User token or null if not found
 */
async function getToken() {
    try {
        const result = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['userToken'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            });
        });
        return result.userToken || null;
    } catch (error) {
        console.error('Error getting token:', error);
        return null;
    }
}

/**
 * Display token count in the UI
 * @returns {Promise<void>}
 */
async function displayTokenCount() {
    try {
        const result = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['tokenCount'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            });
        });
        
        const tokenCountEl = document.getElementById('tokenCount');
        const devStatusDot = document.getElementById('devStatusDot');
        const count = result.tokenCount !== undefined ? result.tokenCount : 0;
        
        if (tokenCountEl) {
            tokenCountEl.textContent = count;
        }
        
        if (devStatusDot) {
            devStatusDot.style.backgroundColor = count > 0 ? '#22c55e' : '#ef4444'; // green or red
        }
    } catch (error) {
        console.error('Error displaying token count:', error);
    }
}

/**
 * Setup developer mode toggle functionality
 * @returns {Promise<void>}
 */
async function setupDevModeToggle() {
  try {
    const devToggle = document.getElementById('devModeToggle');
    const devStatusDot = document.getElementById('devStatusDot');
    const userBadge = document.getElementById('userBadge');
    const dropdown = document.getElementById('profileDropdown');
    const settingsSection = document.querySelector('.section-header')?.parentElement; // Settings container
    
    if (!devToggle || !devStatusDot) {
      console.error('Developer mode toggle elements not found');
      return;
    }

    // Load saved dev mode state
    const result = await new Promise((resolve, reject) => {
      chrome.storage.local.get('devMode', (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });
    
    const isDev = result.devMode || false;
    devToggle.checked = isDev;
    
    // Update settings section visibility if it exists
    if (settingsSection) {
      settingsSection.style.display = isDev ? 'block' : 'none';
    }
    
    // Make sure dropdown is visible when clicking on user badge
    if (userBadge && dropdown) {
      userBadge.addEventListener('click', () => {
        dropdown.classList.toggle('show');
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (event) => {
        if (!userBadge.contains(event.target) && !dropdown.contains(event.target)) {
          dropdown.classList.remove('show');
        }
      });
    }

    // On toggle change → save + update dot
    devToggle.addEventListener('change', async () => {
      try {
        const isDev = devToggle.checked;
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ devMode: isDev }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          });
        });
        
        // Update UI based on dev mode state
        if (settingsSection) {
          settingsSection.style.display = isDev ? 'block' : 'none';
        }
        
        // Update status dot color
        if (devStatusDot) {
          devStatusDot.style.backgroundColor = isDev ? '#22c55e' : '#ef4444';
        }
        
        console.log('Developer mode ' + (isDev ? 'enabled' : 'disabled'));
      } catch (error) {
        console.error('Error saving dev mode state:', error);
        showStatus('Failed to save developer mode setting', 'error');
      }
    });
  } catch (error) {
    console.error('Error setting up dev mode toggle:', error);
  }
}



/**
 * Logout user by removing auth data and redirecting to auth page
 * @returns {Promise<void>}
 */
async function logout() {
    try {
        await new Promise((resolve, reject) => {
            chrome.storage.local.remove(['userToken', 'userInfo', 'authTimestamp'], () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve();
            });
        });
        
        await new Promise((resolve) => {
            chrome.action.setPopup({ popup: 'auth.html' }, resolve);
        });
        
        window.close();
        setTimeout(() => {
            chrome.action.openPopup();
        }, 100);
    } catch (error) {
        console.error('Logout failed:', error);
        showStatus('Logout failed', 'error');
    }
}

/**
 * Display user information in the header
 * @param {Object} userInfo - User information object
 * @returns {void}
 */
function displayUserInfo(userInfo) {
    try {
        const userBadge = document.getElementById('userBadge');
        const userAvatarSmall = document.getElementById('userAvatarSmall');
        const userNameSmall = document.getElementById('userNameSmall');
        
        if (!userBadge || !userAvatarSmall || !userNameSmall) {
            console.warn('User info elements not found in DOM');
            return;
        }
        
        // Default avatar as SVG if no picture provided
        const defaultAvatar = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%23666"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        
        userAvatarSmall.src = userInfo?.picture || defaultAvatar;
        userNameSmall.textContent = userInfo?.name || userInfo?.email || 'User';
        userBadge.style.display = 'flex';
    } catch (error) {
        console.error('Error displaying user info:', error);
    }
}


/**
 * Load job data from storage
 * @returns {Promise<void>}
 */
async function loadJobData() {
    try {
        const result = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['jobData'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            });
        });
        
        if (result.jobData) {
            const data = result.jobData;
            document.getElementById('selectedText').textContent = data.selectedText || 'No text selected';
            document.getElementById('pageUrl').textContent = data.pageUrl || '-';
            document.getElementById('pageTitle').textContent = data.pageTitle || '-';
        }
    } catch (error) {
        console.error('Error loading job data:', error);
        showStatus('Failed to load job data', 'error');
    }
}

/**
 * Setup all event listeners for the popup
 * @returns {void}
 */
function setupEventListeners() {
    try {
        // Settings type selection
        const settingsTypeEl = document.getElementById('settingsType');
        if (settingsTypeEl) {
            settingsTypeEl.addEventListener('change', () => {
                const customSettings = document.getElementById('customSettings');
                const serverUrl = document.getElementById('serverUrl');
                
                if (settingsTypeEl.value === 'custom') {
                    customSettings.style.display = 'block';
                    // Set default URL if empty
                    if (!serverUrl.value) {
                        serverUrl.value = `${baseurl}/mailservice`;
                    }
                } else {
                    customSettings.style.display = 'none';
                    // Clear the input when switching to default
                    serverUrl.value = '';
                }
                
                // Save settings type when changed
                chrome.storage.local.set({ settingsType: settingsTypeEl.value });
            });
        }

        // Email template selection
        const emailTemplateEl = document.getElementById('emailTemplate');
        if (emailTemplateEl) {
            emailTemplateEl.addEventListener('change', () => {
                const customGroup = document.getElementById('customTemplateGroup');
                if (emailTemplateEl.value === 'custom') {
                    customGroup.style.display = 'block';
                } else {
                    customGroup.style.display = 'none';
                }
            });
        }

        // Preview email button
        const previewBtn = document.getElementById('previewBtn');
        if (previewBtn) {
            previewBtn.addEventListener('click', previewEmail);
        }

        // Send to server button
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', sendToServer);
        }

        // Copy email button
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', copyEmail);
        }

        // Send via Gmail button
        const gmailBtn = document.getElementById('gmailBtn');
        if (gmailBtn) {
            gmailBtn.addEventListener('click', sendViaGmail);
        }

        // Logout button in header
        const logoutBtnSmall = document.getElementById('logoutBtnSmall');
        if (logoutBtnSmall) {
            logoutBtnSmall.addEventListener('click', logout);
        }
        
        // User badge dropdown event listeners are now handled in setupDevModeToggle function
        // to ensure proper integration with the developer mode toggle

        // Save custom server URL when changed
        const serverUrlEl = document.getElementById('serverUrl');
        if (serverUrlEl) {
            serverUrlEl.addEventListener('change', () => {
                chrome.storage.local.set({ customServerUrl: serverUrlEl.value });
            });
            
            // Also save when user types in the URL field
            serverUrlEl.addEventListener('input', () => {
                chrome.storage.local.set({ customServerUrl: serverUrlEl.value });
            });
        }
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}



/**
 * Upload and parse resume file
 * @param {File} file - The resume file to upload
 * @returns {Promise<Object|null>} Parsed resume data or null if error
 */
async function uploadResumeToParser(file) {
    try {
        const token = await getToken();
        if (!token) {
            console.error("No token found. Please log in again.");
            return null;
        }

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${baseurl}/parser`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to parse resume: ${response.status} - ${errorText}`);
            return null;
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Error uploading resume:", error);
        return null;
    }
}
    // Resume upload input
// Resume elements
function initResumeUpload() {
const resumeInput = document.getElementById("resumeInput");
const resumeUploadBox = document.getElementById("resumeUploadBox");
const resumeSmallBox = document.getElementById("resumeSmallBox");
const uploadedResumeName = document.getElementById("uploadedResumeName");
const replaceResumeBtn = document.getElementById("replaceResumeBtn");

const fileNameEl = document.getElementById("fileName");
    const parseResumeBtn = document.getElementById("parseResumeBtn");
    const parseLoading = document.getElementById("parseLoading");
    // const parseSuccess = document.getElementById("parseSuccess");
 const resumeRows = document.getElementById("resumeRows");
  const parsedFileLink = document.getElementById("parsedFileLink");
  const statusLabel = document.getElementById("statusLabel");
  const statusIcon = document.getElementById("statusIcon");
  //const replaceResumeBtn = document.getElementById("replaceResumeBtn");

// Check if resume already stored in localStorage
chrome.storage.local.get(['resumeSummary', 'resumeFileName'], function(result) {
    if (result.resumeSummary && result.resumeFileName) {
          renderParsedRow(result.resumeFileName, false);
        
    }
});


// On resume upload
resumeInput.addEventListener("change", function () {
    if (this.files.length > 0) {
        const file = this.files[0];

        // uploadedResumeName.textContent = file.name;    
        fileNameEl.textContent = file.name;
          parseResumeBtn.style.display = "inline-block";
            parseResumeBtn.disabled = false;
            parseLoading.style.display = "none";
        
        
    }
});

// Parse Resume button click
parseResumeBtn.addEventListener("click", function () {
    if (resumeInput.files.length === 0) return;
    const file = resumeInput.files[0];

    // Show loading state
    parseLoading.style.display = "inline";
    parseResumeBtn.disabled = true;

    
    uploadResumeToParser(file)
        .then(result => {
            // console.log(" Pa
            // rsed Resume:", result);
             parseLoading.style.display = "none";
        parseResumeBtn.style.display = "none";
            chrome.storage.local.set({
                resumeSummary: result.summary || JSON.stringify(result),
                resumeFileName: file.name
            }, function () {
const hadError = !!result.error;
          renderParsedRow(file.name, hadError);
                
                
            });

}).catch(err => {
            
        
console.error("Parse failed", err);
        parseLoading.style.display = "none";
        parseResumeBtn.disabled = false;

        // show error row
        renderParsedRow(resumeInput.files[0].name, true);
        });
});
           

// Replace resume
replaceResumeBtn.addEventListener("click", function () {
   
    chrome.storage.local.remove(['resumeSummary', 'resumeFileName'], function() {
    resumeUploadBox.style.display = "block";
      resumeRows.style.display = "none";
      parseResumeBtn.style.display = "none";
      parseLoading.style.display = "none";
      resumeInput.value = "";
      fileNameEl.textContent = "";
});

});
function renderParsedRow(fileName, isError) {
    // hide upload area
    resumeUploadBox.style.display = "none";

    // fill filename link
    parsedFileLink.textContent = fileName;
    // optional: if you have a blob or url you can set parsedFileLink.href = url
    parsedFileLink.href = "#";

    // status text and icon
    if (isError) {
      statusLabel.innerHTML = `Error <span class="status-icon">⚠️</span>`;
  statusLabel.style.color = "#ef4444"; 
    //   statusIcon.innerHTML = `
    //     <svg viewBox="0 0 20 20" fill="#ef4444" width="18" height="18">
    //       <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-4h2v2h-2v-2zm0-8h2v6h-2V6z"/>
    //     </svg>`;
     statusIcon.style.backgroundImage = `url("${chrome.runtime.getURL('icons/error.png')}")`;
    statusIcon.style.backgroundSize = "contain";
    statusIcon.style.backgroundRepeat = "no-repeat";
    statusIcon.style.backgroundPosition = "center";
    } else {
      statusLabel.textContent = "Parsed";
      statusLabel.style.color = "#16a34a";
    //   statusIcon.innerHTML = `
    //     <svg viewBox="0 0 20 20" fill="#16a34a" width="18" height="18">
    //       <path d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586l-3.293-3.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"/>
    //     </svg>`;
    // }
    statusIcon.style.backgroundImage = `url("${chrome.runtime.getURL('icons/parsed.png')}")`;
    statusIcon.style.backgroundSize = "contain";
    statusIcon.style.backgroundRepeat = "no-repeat";
    statusIcon.style.backgroundPosition = "center";

    // show the parsed row + update button
   
  }
   resumeRows.style.display = "block";
    replaceResumeBtn.style.display = "inline-block";

}
}


/**
 * Load saved settings from storage
 * @returns {Promise<void>}
 */
async function loadSavedSettings() {
    try {
        const result = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['settingsType', 'customServerUrl', 'emailTemplate'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            });
        });
        
        // Load settings type
        const settingsType = result.settingsType || 'default';
        document.getElementById('settingsType').value = settingsType;
        
        // Show custom settings if custom is selected
        if (settingsType === 'custom') {
            document.getElementById('customSettings').style.display = 'block';
            // Load saved custom URL or use placeholder
            const customUrl = result.customServerUrl || `${baseurl}/mailservice`;
            document.getElementById('serverUrl').value = customUrl;
        } else {
            // Clear the input when not in custom mode
            document.getElementById('serverUrl').value = '';
        }
        
        // Load email template
        if (result.emailTemplate) {
            document.getElementById('emailTemplate').value = result.emailTemplate;
            // Show custom template input if custom is selected
            if (result.emailTemplate === 'custom') {
                document.getElementById('customTemplateGroup').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading saved settings:', error);
        showStatus('Failed to load settings', 'error');
    }
}

/**
 * Preview the email content
 * @returns {Promise<void>}
 */
async function previewEmail() {
    try {
        const result = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['jobData'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            });
        });
        
        if (!result.jobData) {
            showStatus('No job data available', 'error');
            return;
        }

        const template = document.getElementById('emailTemplate').value;
        const customTemplate = document.getElementById('customTemplate').value;
        const emailContent = mail;
        
        document.getElementById('emailContent').innerHTML = emailContent;
        document.getElementById('emailPreview').style.display = 'block';
        document.getElementById('copyBtn').style.display = 'block';
    } catch (error) {
        console.error('Error generating preview:', error);
        showStatus('Failed to generate preview', 'error');
    }
}

/**
 * Generate email content based on job details
 * @param {Object} jobDetails - The job details object containing subject and body
 * @param {boolean} forGmail - Whether to format for Gmail or regular display
 * @returns {Object|string} Formatted email content
 */
function generateEmailContent(jobDetails, forGmail = false) {
    // Extract subject and body from job details
    let subject = jobDetails.subject;
    let body = jobDetails.body;
    
    if (forGmail) {
        return { subject, body };
    }
    
    return `<div><strong>Subject:</strong> ${subject}</div><hr><div style="white-space: pre-wrap;">${body}</div>`;
}

/**
 * Get current server URL based on configuration
 * @returns {string} The configured server URL
 */
function getCurrentServerUrl() {
    const settingsType = document.getElementById('settingsType').value;
    
    if (settingsType === 'default') {
        return `${baseurl}/mailservice`; // Default configuration from code
    } else {
        const customUrl = document.getElementById('serverUrl').value;
        return customUrl || `${baseurl}/mailservice`; // Fallback if empty
    }
}

/**
 * Send message to background script and get response
 * @param {Object} message - Message to send to background script
 * @returns {Promise<any>} Response from background script
 */
async function sendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(new Error(`Failed to send message: ${error.message}`));
    }
  });
}

/**
 * Get data from chrome storage
 * @param {string|Array<string>} keys - Keys to retrieve from storage
 * @returns {Promise<Object>} Storage data
 */
async function getStorageData(keys) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            });
        } catch (error) {
            reject(new Error(`Failed to get storage data: ${error.message}`));
        }
    });
}

/**
 * Send job data to server for email generation
 * @returns {Promise<void>}
 */
async function sendToServer() {
  const serverUrl = getCurrentServerUrl();
  const jobDataObj = await getStorageData('jobData');

  if (!serverUrl) {
    showStatus('Please configure a server URL', 'error');
    return;
  }

  const selectedText = jobDataObj.jobData?.selectedText;
  const pageUrl = jobDataObj.jobData?.pageUrl;
  const pageTitle = jobDataObj.jobData?.pageTitle;

  if (!selectedText || !pageUrl || !pageTitle) {
    showStatus('Please select text on a job page and right-click "Share to Job Email"', 'error');
    return;
  }
  
  const resumeData = await getStorageData('resumeSummary');
  const resumeSummary = resumeData.resumeSummary;
  
  if (!resumeSummary) {
    showStatus("Please upload your resume before sending!", "error");
    return;
  }

  const profile_data = resumeSummary;

  showLoading(true, 'Sending to server...');

  try {
    const template = document.getElementById('emailTemplate').value;
    const customTemplate = document.getElementById('customTemplate').value;

    const response = await sendMessageAsync({
      action: 'sendToServer',
      serverUrl,
      data: { 
        url: pageUrl, 
        message: selectedText, 
        title: pageTitle, 
        resumeSummary, 
        profile_data, 
        template 
      }
    });

    showLoading(false);
  
    if (response && (response.success || response.data?.tokenCount !== undefined)) {
      showStatus('Successfully sent to server!', 'success');
      
      if (response.data?.tokenCount !== undefined) {
        chrome.storage.local.set({ tokenCount: response.data.tokenCount });
        displayTokenCount(); // Update UI immediately
      }
      
      const jobDetails = {
        subject: response.data.model.subject,
        body: response.data.model.body,
        recipient_mail: response.data.model.recipient_mail,
        company_name: response.data.model.company_name,
        location: response.data.model.location,
        techstack: response.data.model.techstack
      };

      localStorage.setItem('jobDetails', JSON.stringify(jobDetails));
    
      mail = generateEmailContent(jobDetails, false);
      
      if (response.data && jobDetails && jobDetails.recipient_mail) {
        document.getElementById('mailActions').style.display = 'block';
      }
    } else {
      showStatus(`Error: ${response?.error || 'Failed to connect to server'}`, 'error');
    }
  } catch (err) {
    showLoading(false);
    console.error('Server request failed:', err);
    showStatus(`Error: ${err.message}`, 'error');
  }
}


/**
 * Copy email content to clipboard
 * @returns {Promise<void>}
 */
async function copyEmail() {
    try {
        const emailContent = document.getElementById('emailContent');
        const textContent = emailContent.textContent || emailContent.innerText;
        
        await navigator.clipboard.writeText(textContent);
        showStatus('Email content copied to clipboard!', 'success');
    } catch (error) {
        console.error('Copy failed:', error);
        showStatus('Failed to copy to clipboard', 'error');
    }
}

/**
 * Show status message to the user
 * @param {string} message - Message to display
 * @param {string} type - Message type (success, error, info)
 * @returns {void}
 */
function showStatus(message, type = 'info') {
    try {
        const statusEl = document.getElementById('status');
        
        if (!statusEl) {
            console.error('Status element not found');
            return;
        }
        
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        statusEl.style.display = 'block';
        
        // Hide after 5 seconds
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    } catch (error) {
        console.error('Error showing status:', error);
    }
}

/**
 * Show or hide loading indicator with message
 * @param {boolean} show - Whether to show or hide the loading indicator
 * @param {string} message - Message to display when showing
 * @returns {void}
 */
function showLoading(show, message = 'Sending...') {
    try {
        const loadingEl = document.getElementById('loading');
        const sendBtn = document.getElementById('sendBtn');
        const gmailBtn = document.getElementById('gmailBtn');
        
        if (!loadingEl || !sendBtn || !gmailBtn) {
            console.error('Loading or button elements not found');
            return;
        }
        
        if (show) {
            loadingEl.style.display = 'block';
            loadingEl.querySelector('div:last-child').textContent = message;
            sendBtn.disabled = true;
            gmailBtn.disabled = true;
            sendBtn.textContent = 'Sending...';
            gmailBtn.textContent = 'Sending...';
        } else {
            loadingEl.style.display = 'none';
            sendBtn.disabled = false;
            gmailBtn.disabled = false;
            sendBtn.textContent = 'Send to Server';
            gmailBtn.textContent = 'Send via Gmail';
        }
    } catch (error) {
        console.error('Error managing loading state:', error);
    }
}
function previewEmail() {
            const jobDetailsStr = localStorage.getItem('jobDetails');
            const jobDetails = jobDetailsStr ? JSON.parse(jobDetailsStr) : null;
            // Simulate the original function behavior

            document.getElementById('subjectContent').innerHTML = jobDetails.subject;
            document.getElementById('emailContent').innerHTML = jobDetails.body;
            document.getElementById('emailPreview').style.display = 'block';
            // originalContent = emailContent;
            
            // Reset to preview mode
            if (isEditMode) {
                toggleEditMode();
            }
        }

        /**
 * Toggle edit mode for email content
 * @returns {void}
 */
function toggleEditMode() {
    try {
        // Get all required elements using destructuring for cleaner code
        const elements = {
            emailContent: document.getElementById('emailContent'),
            subjectContent: document.getElementById('subjectContent'),
            emailTextarea: document.getElementById('emailTextarea'),
            subjectTextarea: document.getElementById('subjectTextarea'),
            editBtn: document.getElementById('editBtn'),
            saveBtn: document.getElementById('saveBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            copyBtn: document.getElementById('copyBtn')
        };
        
        // Check if all elements exist
        const missingElements = Object.entries(elements)
            .filter(([_, el]) => !el)
            .map(([name]) => name);
            
        if (missingElements.length > 0) {
            console.error(`Missing elements: ${missingElements.join(', ')}`);
            return;
        }

        if (!isEditMode) {
            // Switch to edit mode
            isEditMode = true;
            
            // Get current content and populate textarea
            const { emailContent, subjectContent, emailTextarea, subjectTextarea } = elements;
            emailTextarea.value = emailContent.textContent;
            subjectTextarea.value = subjectContent.textContent;
            
            // Toggle visibility with object destructuring
            Object.assign(emailContent.style, { display: 'none' });
            Object.assign(emailTextarea.style, { display: 'block' });
            Object.assign(subjectContent.style, { display: 'none' });
            Object.assign(subjectTextarea.style, { display: 'block' });
            
            // Update buttons
            const { editBtn, saveBtn, cancelBtn, copyBtn } = elements;
            Object.assign(editBtn.style, { display: 'none' });
            Object.assign(saveBtn.style, { display: 'inline-block' });
            Object.assign(cancelBtn.style, { display: 'inline-block' });
            Object.assign(copyBtn.style, { display: 'none' });
            
            // Focus on textarea
            emailTextarea.focus();
        }
    } catch (error) {
        console.error('Error toggling edit mode:', error);
        showStatus('Failed to toggle edit mode', 'error');
    }
}

        /**
         * Save changes to email preview
         * @returns {void}
         */
        function saveChanges() {
            try {
                // Get all required elements using destructuring for cleaner code
                const elements = {
                    emailContent: document.getElementById('emailContent'),
                    subjectContent: document.getElementById('subjectContent'),
                    emailTextarea: document.getElementById('emailTextarea'),
                    subjectTextarea: document.getElementById('subjectTextarea'),
                    editBtn: document.getElementById('editBtn'),
                    saveBtn: document.getElementById('saveBtn'),
                    cancelBtn: document.getElementById('cancelBtn'),
                    copyBtn: document.getElementById('copyBtn')
                };
                
                // Check if all elements exist
                const missingElements = Object.entries(elements)
                    .filter(([_, el]) => !el)
                    .map(([name]) => name);
                    
                if (missingElements.length > 0) {
                    console.error(`Missing elements: ${missingElements.join(', ')}`);
                    return;
                }

                // Get the edited content
                const { emailTextarea, subjectTextarea } = elements;
                const editedContent = emailTextarea.value;
                
                // Update the preview content
                const { emailContent, subjectContent } = elements;
                emailContent.textContent = editedContent;
                originalContent = editedContent;
                subjectContent.textContent = subjectTextarea.value;

                // Update job details in localStorage
                const jobDetailsStr = localStorage.getItem('jobDetails');
                const jobDetails = jobDetailsStr ? JSON.parse(jobDetailsStr) : {};
                jobDetails.body = editedContent;
                jobDetails.subject = subjectTextarea.value;
                localStorage.setItem('jobDetails', JSON.stringify(jobDetails));

                // Switch back to preview mode
                isEditMode = false;
                
                // Toggle visibility using object destructuring
                Object.assign(emailTextarea.style, { display: 'none' });
                Object.assign(emailContent.style, { display: 'block' });
                Object.assign(subjectTextarea.style, { display: 'none' });
                Object.assign(subjectContent.style, { display: 'block' });
                
                // Update buttons
                const { saveBtn, cancelBtn, editBtn, copyBtn } = elements;
                Object.assign(saveBtn.style, { display: 'none' });
                Object.assign(cancelBtn.style, { display: 'none' });
                Object.assign(editBtn.style, { display: 'inline-block' });
                Object.assign(copyBtn.style, { display: 'inline-block' });
                
                // Show success feedback
                showStatus('Email updated successfully!', 'success');
            } catch (error) {
                console.error('Error saving changes:', error);
                showStatus('Failed to save changes', 'error');
            }
        }

        /**
 * Cancel edit mode without saving changes
 * @returns {void}
 */
function cancelEdit() {
    try {
        // Get all required elements using destructuring for cleaner code
        const elements = {
            emailContent: document.getElementById('emailContent'),
            subjectContent: document.getElementById('subjectContent'),
            emailTextarea: document.getElementById('emailTextarea'),
            subjectTextarea: document.getElementById('subjectTextarea'),
            editBtn: document.getElementById('editBtn'),
            saveBtn: document.getElementById('saveBtn'),
            cancelBtn: document.getElementById('cancelBtn'),
            copyBtn: document.getElementById('copyBtn')
        };
        
        // Check if all elements exist
        const missingElements = Object.entries(elements)
            .filter(([_, el]) => !el)
            .map(([name]) => name);
            
        if (missingElements.length > 0) {
            console.error(`Missing elements: ${missingElements.join(', ')}`);
            return;
        }

        // Switch back to preview mode without saving
        isEditMode = false;
        
        // Toggle visibility using object destructuring
        const { emailContent, subjectContent, emailTextarea, subjectTextarea } = elements;
        Object.assign(emailTextarea.style, { display: 'none' });
        Object.assign(emailContent.style, { display: 'block' });
        Object.assign(subjectTextarea.style, { display: 'none' });
        Object.assign(subjectContent.style, { display: 'block' });
        
        // Update buttons
        const { editBtn, saveBtn, cancelBtn, copyBtn } = elements;
        Object.assign(saveBtn.style, { display: 'none' });
        Object.assign(cancelBtn.style, { display: 'none' });
        Object.assign(editBtn.style, { display: 'inline-block' });
        Object.assign(copyBtn.style, { display: 'inline-block' });
        
        // Show status message
        showStatus('Edit canceled', 'info');
    } catch (error) {
        console.error('Error canceling edit:', error);
        showStatus('Failed to cancel edit', 'error');
    }
}

        function showStatus(message, type) {
            // Simple status notification
            const statusDiv = document.createElement('div');
            statusDiv.textContent = message;
            statusDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 10px 20px;
                border-radius: 6px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                transition: opacity 0.3s ease;
                ${type === 'success' ? 'background: #48bb78;' : 'background: #f56565;'}
            `;
            
            document.body.appendChild(statusDiv);
            
            setTimeout(() => {
                statusDiv.style.opacity = '0';
                setTimeout(() => {
                    document.body.removeChild(statusDiv);
                }, 300);
            }, 2000);
        }

    // Preview email button
    document.getElementById('editBtn').addEventListener('click', toggleEditMode);
    document.getElementById('saveBtn').addEventListener('click', saveChanges);
    document.getElementById('cancelBtn').addEventListener('click', cancelEdit);
