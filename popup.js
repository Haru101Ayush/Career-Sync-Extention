// Popup JavaScript for Job Email Helper extension
const baseurl = "https://ridgelike-katina-kissably.ngrok-free.app";

// Global variables
let isEditMode = false;
let MailList = [];
let originalContent = '';

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
    await getMailList();
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
    const response = await sendMessageAsync({ action: 'checkAuthStatus' });
    
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
 * Utility functions
 */
function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsArrayBuffer(file);
    } catch (error) {
      reject(error);
    }
  });
}

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

    const resumeFile = document.getElementById("resumeInput").files[0];
    let fileToProcess = resumeFile;
    let fileName = '';
    
    if (!fileToProcess) {
      try {
        const savedResumeData = await getStorageData(['resumeFileName', 'resumeFileBase64']);
        if (savedResumeData.resumeFileBase64) {
          // Convert the Base64 string back to a Blob object
          const base64 = savedResumeData.resumeFileBase64;
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          fileToProcess = new Blob([bytes.buffer], { type: 'application/pdf' });
          fileName = savedResumeData.resumeFileName;
        }
      } catch (storageError) {
        console.error('Error loading saved resume:', storageError);
      }
    } else {
      fileName = resumeFile.name;
    }
    
    if (!fileToProcess) {
      showStatus('Please select or save a resume file.', 'error');
      return;
    }

    const fileData = await fileToArrayBuffer(fileToProcess);

    // Create a serializable data object for the attachment
    const attachment = {
      name: fileName,
      type: fileToProcess.type || "application/pdf",
      // Convert the ArrayBuffer to a serializable array of numbers
      data: Array.from(new Uint8Array(fileData))
    };

    const emailData = {
      to: jobDetails.recipient_mail,
      subject: jobDetails.subject || 'No Subject',
      body: jobDetails.body || '',
      isHtml: false,
      attachments: [attachment]
    };
    
    showLoading(true, 'Sending email via Gmail...');
    
    const response = await sendMessageAsync({
      action: 'sendEmailViaGmail',
      emailData: emailData
    });

    showLoading(false);

    if (response && response.success) {
      showStatus('Email sent successfully via Gmail!', 'success');
      
      // Clear job data after successful send
      await new Promise((resolve) => {
        chrome.storage.local.remove(['jobData'], resolve);
      });
      
      // Reset UI
      document.getElementById('selectedText').textContent = 'No text selected';
      document.getElementById('pageUrl').textContent = '-';
      document.getElementById('pageTitle').textContent = '-';
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
    const result = await getStorageData(['Apikey']);
    return result.Apikey || null;
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
    const result = await getStorageData(['tokenCount']);
    
    const tokenCountEl = document.getElementById('tokenCount');
    const devStatusDot = document.getElementById('devStatusDot');
    const count = result.tokenCount !== undefined ? result.tokenCount : 0;
    
    if (tokenCountEl) {
      tokenCountEl.textContent = count;
      tokenCountEl.style.color = count > 0 ? '#22c55e' : '#ef4444';
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
    const userBadge = document.getElementById('userBadge');
    const dropdown = document.getElementById('profileDropdown');
    const settingsSection = document.querySelector('.section-header')?.parentElement; // Settings container
    
    if (!devToggle) {
      console.error('Developer mode toggle elements not found');
      return;
    }

    // Load saved dev mode state
    const result = await getStorageData(['devMode']);
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

    // On toggle change → save + update UI
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
      chrome.storage.local.remove(['userToken', 'Apikey', 'userInfo', 'authTimestamp'], () => {
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
    const result = await getStorageData(['jobData']);
    
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
        try {
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
        } catch (error) {
          console.error('Error handling settings type change:', error);
        }
      });
    }

    // Email template selection
    const emailTemplateEl = document.getElementById('emailTemplate');
    if (emailTemplateEl) {
      emailTemplateEl.addEventListener('change', () => {
        try {
          const customGroup = document.getElementById('customTemplateGroup');
          if (emailTemplateEl.value === 'custom') {
            customGroup.style.display = 'block';
          } else {
            customGroup.style.display = 'none';
          }
        } catch (error) {
          console.error('Error handling email template change:', error);
        }
      });
    }

    // Button event listeners
    const buttons = [
      { id: 'previewBtn', handler: previewEmail },
      { id: 'sendBtn', handler: sendToServer },
      { id: 'copyBtn', handler: copyEmail },
      { id: 'gmailBtn', handler: sendViaGmail },
      { id: 'logoutBtnSmall', handler: logout },
      { id: 'editBtn', handler: toggleEditMode },
      { id: 'saveBtn', handler: saveChanges },
      { id: 'cancelBtn', handler: cancelEdit }
    ];

    buttons.forEach(({ id, handler }) => {
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', handler);
      }
    });

    // Save custom server URL when changed
    const serverUrlEl = document.getElementById('serverUrl');
    if (serverUrlEl) {
      const saveUrl = () => {
        try {
          chrome.storage.local.set({ customServerUrl: serverUrlEl.value });
        } catch (error) {
          console.error('Error saving custom server URL:', error);
        }
      };
      
      serverUrlEl.addEventListener('change', saveUrl);
      serverUrlEl.addEventListener('input', saveUrl);
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

/**
 * Initialize resume upload functionality
 * @returns {void}
 */
function initResumeUpload() {
  try {
    const resumeInput = document.getElementById("resumeInput");
    const resumeUploadBox = document.getElementById("resumeUploadBox");
    const resumeRows = document.getElementById("resumeRows");
    const fileNameEl = document.getElementById("fileName");
    const parseResumeBtn = document.getElementById("parseResumeBtn");
    const parseLoading = document.getElementById("parseLoading");
    const replaceResumeBtn = document.getElementById("replaceResumeBtn");
    
    if (!resumeInput) {
      console.error('Resume input elements not found');
      return;
    }

    // Check if resume already stored in storage
    chrome.storage.local.get(['resumeSummary', 'resumeFileName'], function(result) {
      if (result.resumeSummary && result.resumeFileName) {
        renderParsedRow(result.resumeFileName, false);
      }
    });

    // On resume upload
    resumeInput.addEventListener("change", function () {
      try {
        if (this.files.length > 0) {
          const file = this.files[0];
          
          if (fileNameEl) fileNameEl.textContent = file.name;
          if (parseResumeBtn) {
            parseResumeBtn.style.display = "inline-block";
            parseResumeBtn.disabled = false;
          }
          if (parseLoading) parseLoading.style.display = "none";
        }
      } catch (error) {
        console.error('Error handling resume file selection:', error);
      }
    });

    // Parse Resume button click
    if (parseResumeBtn) {
      parseResumeBtn.addEventListener("click", async function () {
        try {
          if (resumeInput.files.length === 0) return;
          const file = resumeInput.files[0];

          // Show loading state
          if (parseLoading) parseLoading.style.display = "inline";
          parseResumeBtn.disabled = true;

          const base64Data = await fileToBase64(file);
          const result = await uploadResumeToParser(file);

          // Hide loading
          if (parseLoading) parseLoading.style.display = "none";
          if (parseResumeBtn) parseResumeBtn.style.display = "none";

          // Save to storage
          chrome.storage.local.set({
            resumeSummary: result.summary || JSON.stringify(result),
            resumeFileName: file.name,
            resumeFileBase64: base64Data
          }, function () {
            const hadError = !!result?.error;
            renderParsedRow(file.name, hadError);
          });

        } catch (err) {
          console.error("Parse failed", err);
          if (parseLoading) parseLoading.style.display = "none";
          if (parseResumeBtn) parseResumeBtn.disabled = false;

          // Show error row
          if (resumeInput.files.length > 0) {
            renderParsedRow(resumeInput.files[0].name, true);
          }
        }
      });
    }

    // Replace resume
    if (replaceResumeBtn) {
      replaceResumeBtn.addEventListener("click", function () {
        try {
          chrome.storage.local.remove(['resumeSummary', 'resumeFileName', 'resumeFileBase64'], function() {
            if (resumeUploadBox) resumeUploadBox.style.display = "block";
            if (resumeRows) resumeRows.style.display = "none";
            if (parseResumeBtn) parseResumeBtn.style.display = "none";
            if (parseLoading) parseLoading.style.display = "none";
            resumeInput.value = "";
            if (fileNameEl) fileNameEl.textContent = "";
          });
        } catch (error) {
          console.error('Error replacing resume:', error);
        }
      });
    }

    function renderParsedRow(fileName, isError) {
      try {
        const parsedFileLink = document.getElementById("parsedFileLink");
        const statusLabel = document.getElementById("statusLabel");
        const statusIcon = document.getElementById("statusIcon");

        // Hide upload area
        if (resumeUploadBox) resumeUploadBox.style.display = "none";

        // Fill filename link
        if (parsedFileLink) {
          parsedFileLink.textContent = fileName;
          parsedFileLink.href = "#";
        }

        // Status text and icon
        if (statusLabel) {
          if (isError) {
            statusLabel.innerHTML = `Error <span class="status-icon">⚠️</span>`;
            statusLabel.style.color = "#ef4444";
          } else {
            statusLabel.textContent = "Parsed";
            statusLabel.style.color = "#16a34a";
          }
        }

        if (statusIcon) {
          const iconPath = isError ? 'icons/error.png' : 'icons/parsed.png';
          statusIcon.style.backgroundImage = `url("${chrome.runtime.getURL(iconPath)}")`;
          statusIcon.style.backgroundSize = "contain";
          statusIcon.style.backgroundRepeat = "no-repeat";
          statusIcon.style.backgroundPosition = "center";
        }

        // Show the parsed row + update button
        if (resumeRows) resumeRows.style.display = "block";
        if (replaceResumeBtn) replaceResumeBtn.style.display = "inline-block";
      } catch (error) {
        console.error('Error rendering parsed row:', error);
      }
    }
  } catch (error) {
    console.error('Error initializing resume upload:', error);
  }
}

/**
 * Load saved settings from storage
 * @returns {Promise<void>}
 */
async function loadSavedSettings() {
  try {
    const result = await getStorageData(['settingsType', 'customServerUrl', 'emailTemplate']);
    
    // Load settings type
    const settingsType = result.settingsType || 'default';
    const settingsTypeEl = document.getElementById('settingsType');
    if (settingsTypeEl) {
      settingsTypeEl.value = settingsType;
    }
    
    // Show custom settings if custom is selected
    if (settingsType === 'custom') {
      const customSettings = document.getElementById('customSettings');
      const serverUrl = document.getElementById('serverUrl');
      
      if (customSettings) customSettings.style.display = 'block';
      
      // Load saved custom URL or use placeholder
      const customUrl = result.customServerUrl || `${baseurl}/mailservice`;
      if (serverUrl) serverUrl.value = customUrl;
    } else {
      // Clear the input when not in custom mode
      const serverUrl = document.getElementById('serverUrl');
      if (serverUrl) serverUrl.value = '';
    }
    
    // Load email template
    if (result.emailTemplate) {
      const emailTemplateEl = document.getElementById('emailTemplate');
      if (emailTemplateEl) {
        emailTemplateEl.value = result.emailTemplate;
        // Show custom template input if custom is selected
        if (result.emailTemplate === 'custom') {
          const customTemplateGroup = document.getElementById('customTemplateGroup');
          if (customTemplateGroup) customTemplateGroup.style.display = 'block';
        }
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
    const jobDetailsStr = localStorage.getItem('jobDetails');
    const jobDetails = jobDetailsStr ? JSON.parse(jobDetailsStr) : null;
    
    if (!jobDetails) {
      showStatus('No job data available', 'error');
      return;
    }

    const subjectContent = document.getElementById('subjectContent');
    const emailContent = document.getElementById('emailContent');
    const emailPreview = document.getElementById('emailPreview');
    
    if (subjectContent) subjectContent.innerHTML = jobDetails.subject;
    if (emailContent) emailContent.innerHTML = jobDetails.body;
    if (emailPreview) emailPreview.style.display = 'block';
    
    // Reset to preview mode
    if (isEditMode) {
      toggleEditMode();
    }
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
  try {
    // Extract subject and body from job details
    const subject = jobDetails.subject || '';
    const body = jobDetails.body || '';
    
    if (forGmail) {
      return { subject, body };
    }
    
    return `<div><strong>Subject:</strong> ${subject}</div><hr><div style="white-space: pre-wrap;">${body}</div>`;
  } catch (error) {
    console.error('Error generating email content:', error);
    return forGmail ? { subject: '', body: '' } : '';
  }
}

/**
 * Get current server URL based on configuration
 * @returns {string} The configured server URL
 */
function getCurrentServerUrl() {
  try {
    const settingsTypeEl = document.getElementById('settingsType');
    const settingsType = settingsTypeEl ? settingsTypeEl.value : 'default';
    
    if (settingsType === 'default') {
      return `${baseurl}/mailservice`; // Default configuration from code
    } else {
      const serverUrlEl = document.getElementById('serverUrl');
      const customUrl = serverUrlEl ? serverUrlEl.value : '';
      return customUrl || `${baseurl}/mailservice`; // Fallback if empty
    }
  } catch (error) {
    console.error('Error getting server URL:', error);
    return `${baseurl}/mailservice`;
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
 * Get mail list from background script
 * @returns {Promise<any>} Mail list response
 */
async function getMailList() {
  try {
    const response = await sendMessageAsync({ action: 'getMailList' });
    MailList = response.mailList || [];
    console.log('Mail list loaded:', MailList);
    return response;
  } catch (error) {
    console.error('Error getting mail list:', error);
    MailList = [];
    throw new Error(`Failed to get mail list: ${error.message}`);
  }
}

/**
 * Delete mail by ID
 * @param {string} id - Mail ID to delete
 * @returns {Promise<any>} Delete response
 */
async function deleteMail(id) {
  try {
    const response = await sendMessageAsync({ action: 'deleteMail', mailId: id });
    await getMailList(); // Refresh the list after deletion
    return response;
  } catch (error) {
    console.error('Error deleting mail:', error);
    throw new Error(`Failed to delete mail: ${error.message}`);
  }
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
  try {
    const serverUrl = getCurrentServerUrl();
    
    if (!serverUrl) {
      showStatus('Please configure a server URL', 'error');
      return;
    }

    const jobDataObj = await getStorageData('jobData');
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

    showLoading(true, 'Sending to server...');

    const templateEl = document.getElementById('emailTemplate');
    const customTemplateEl = document.getElementById('customTemplate');
    const template = templateEl ? templateEl.value : 'default';

    const response = await sendMessageAsync({
      action: 'sendToServer',
      serverUrl,
      data: { 
        url: pageUrl, 
        message: selectedText, 
        title: pageTitle, 
        resumeSummary, 
        profile_data: resumeSummary, 
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

      await getMailList();
      const maillistEl = document.getElementById('maillist');
      console.log('maillistEl', MailList);
      if (maillistEl) {
        maillistEl.innerHTML = MailList;
      }

      localStorage.setItem('jobDetails', JSON.stringify(jobDetails));
    
      const mail = generateEmailContent(jobDetails, false);
      
      if (response.data && jobDetails && jobDetails.recipient_mail) {
        const mailActions = document.getElementById('mailActions');
        if (mailActions) mailActions.style.display = 'block';
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
    if (!emailContent) {
      showStatus('No email content to copy', 'error');
      return;
    }
    
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
function showLoading(show, message = null) {
  try {
    const loadingEl = document.getElementById('loading');
    const sendBtn = document.getElementById('sendBtn');
    const gmailBtn = document.getElementById('gmailBtn');
    
    if (!loadingEl || !sendBtn || !gmailBtn) return;
    
    if (show) {
      loadingEl.style.display = 'flex';
      const messageEl = loadingEl.querySelector('div:last-child');
      if (messageEl) messageEl.textContent = message || '';
      
      sendBtn.disabled = true;
      gmailBtn.disabled = true;
    } else {
      loadingEl.style.display = 'none';
      sendBtn.disabled = false;
      gmailBtn.disabled = false;
    }
  } catch (error) {
    console.error('Error managing loading state:', error);
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
      
      // Store original content for cancel functionality
      originalContent = emailContent.textContent;
      
      // Toggle visibility
      emailContent.style.display = 'none';
      emailTextarea.style.display = 'block';
      subjectContent.style.display = 'none';
      subjectTextarea.style.display = 'block';
      
      // Update buttons
      const { editBtn, saveBtn, cancelBtn, copyBtn } = elements;
      editBtn.style.display = 'none';
      saveBtn.style.display = 'inline-block';
      cancelBtn.style.display = 'inline-block';
      copyBtn.style.display = 'none';
      
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
    // Get all required elements
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
    try {
      const jobDetailsStr = localStorage.getItem('jobDetails');
      const jobDetails = jobDetailsStr ? JSON.parse(jobDetailsStr) : {};
      jobDetails.body = editedContent;
      jobDetails.subject = subjectTextarea.value;
      localStorage.setItem('jobDetails', JSON.stringify(jobDetails));
    } catch (storageError) {
      console.error('Error updating job details in localStorage:', storageError);
    }

    // Switch back to preview mode
    isEditMode = false;
    
    // Toggle visibility
    emailTextarea.style.display = 'none';
    emailContent.style.display = 'block';
    subjectTextarea.style.display = 'none';
    subjectContent.style.display = 'block';
    
    // Update buttons
    const { saveBtn, cancelBtn, editBtn, copyBtn } = elements;
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    editBtn.style.display = 'inline-block';
    copyBtn.style.display = 'inline-block';
    
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
    // Get all required elements
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
    
    // Toggle visibility
    const { emailContent, subjectContent, emailTextarea, subjectTextarea } = elements;
    emailTextarea.style.display = 'none';
    emailContent.style.display = 'block';
    subjectTextarea.style.display = 'none';
    subjectContent.style.display = 'block';
    
    // Update buttons
    const { editBtn, saveBtn, cancelBtn, copyBtn } = elements;
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    editBtn.style.display = 'inline-block';
    copyBtn.style.display = 'inline-block';
    
    // Show status message
    showStatus('Edit canceled', 'info');
  } catch (error) {
    console.error('Error canceling edit:', error);
    showStatus('Failed to cancel edit', 'error');
  }
}