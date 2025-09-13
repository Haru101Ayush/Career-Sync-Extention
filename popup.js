// Popup JavaScript for Job Email Helper extension
const baseurl="https://ridgelike-katina-kissably.ngrok-free.app"
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    loadJobData();
    setupEventListeners();
    loadSavedSettings();
     initResumeUpload();
});

// Check if user is authenticated
function checkAuthStatus() {
    chrome.runtime.sendMessage({ action: 'checkAuthStatus' }, function(response) {
        if (!response.authenticated) {
            // Redirect to auth page
            chrome.action.setPopup({ popup: 'auth.html' });
            window.close();
            setTimeout(() => {
                chrome.action.openPopup();
            }, 100);
            return;
        }
        
        // User is authenticated, show user info if available
        if (response.userInfo) {
            displayUserInfo(response.userInfo);
        }
    });
}

// Send email via Gmail API
function sendViaGmail() {
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

    chrome.runtime.sendMessage({
        action: 'sendEmailViaGmail',
        emailData: emailData
    }, function(response) {
        showLoading(false);

        if (response && response.success) {
            showStatus('Email sent successfully via Gmail!', 'success');
        } else {
            const errorMsg = response ? response.error : 'Failed to send email';
            showStatus(`Gmail Error: ${errorMsg}`, 'error');
        }
    });
}

function getToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['userToken'], (result) => {
            resolve(result.userToken || null);
        });
    });
}


// Logout function
function logout() {
    chrome.storage.local.remove(['userToken', 'userInfo', 'authTimestamp'], function() {
        chrome.action.setPopup({ popup: 'auth.html' });
        window.close();
        setTimeout(() => {
            chrome.action.openPopup();
        }, 100);
    });
}

// Display user info in header
function displayUserInfo(userInfo) {
    const userBadge = document.getElementById('userBadge');
    const userAvatarSmall = document.getElementById('userAvatarSmall');
    const userNameSmall = document.getElementById('userNameSmall');
    
    if (userBadge && userAvatarSmall && userNameSmall) {
        userAvatarSmall.src = userInfo.picture || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%23666"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        userNameSmall.textContent = userInfo.name || userInfo.email || 'User';
        userBadge.style.display = 'flex';
    }

}


// Load job data from storage
function loadJobData() {
    chrome.storage.local.get(['jobData'], function(result) {
        if (result.jobData) {
            const data = result.jobData;
            document.getElementById('selectedText').textContent = data.selectedText || 'No text selected';
            document.getElementById('pageUrl').textContent = data.pageUrl || '-';
            document.getElementById('pageTitle').textContent = data.pageTitle || '-';
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Settings type selection
    document.getElementById('settingsType').addEventListener('change', function() {
        const customSettings = document.getElementById('customSettings');
        const serverUrl = document.getElementById('serverUrl');
        
        if (this.value === 'custom') {
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
    });

    // Email template selection
    document.getElementById('emailTemplate').addEventListener('change', function() {
        const customGroup = document.getElementById('customTemplateGroup');
        if (this.value === 'custom') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
    });

    // Preview email button
    document.getElementById('previewBtn').addEventListener('click', previewEmail);

    // Send to server button
    document.getElementById('sendBtn').addEventListener('click', sendToServer);

    // Copy email button
    document.getElementById('copyBtn').addEventListener('click', copyEmail);

    // Send via Gmail button
    document.getElementById('gmailBtn').addEventListener('click', sendViaGmail);

    // Logout button in header
    document.getElementById('logoutBtnSmall').addEventListener('click', logout);

    // Save settings type when changed
    document.getElementById('settingsType').addEventListener('change', function() {
        chrome.storage.local.set({ settingsType: this.value });
    });

    // Save custom server URL when changed
    document.getElementById('serverUrl').addEventListener('change', function() {
        chrome.storage.local.set({ customServerUrl: this.value });
    });

    // Also save when user types in the URL field
    document.getElementById('serverUrl').addEventListener('input', function() {
        chrome.storage.local.set({ customServerUrl: this.value });
    });
}



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
    const parseSuccess = document.getElementById("parseSuccess");


// Check if resume already stored in localStorage
chrome.storage.local.get(['resumeSummary', 'resumeFileName'], function(result) {
    if (result.resumeSummary && result.resumeFileName) {
        // Resume already exists → show small update box
        uploadedResumeName.textContent = result.resumeFileName + " ✔";
        resumeUploadBox.style.display = "none";
        resumeSmallBox.style.display = "flex";
    } else {
        // No resume yet → show big upload box
        resumeUploadBox.style.display = "block";
        resumeSmallBox.style.display = "flex";
    }
});


// On resume upload
resumeInput.addEventListener("change", function () {
    if (this.files.length > 0) {
        const file = this.files[0];

        uploadedResumeName.textContent = file.name;    
        uploadedResumeName.style.pointerEvents = "none";    
        uploadedResumeName.target = "_blank"; 
          parseResumeBtn.style.display = "inline-block";
            parseResumeBtn.disabled = false;
            parseLoading.style.display = "none";
            parseSuccess.style.display = "none";
        
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
            console.log(" Parsed Resume:", result);


            chrome.storage.local.set({
                resumeSummary: result.summary || JSON.stringify(result),
                resumeFileName: file.name
            }, function () {
                // Hide loader, show success
                parseLoading.style.display = "none";
                parseSuccess.style.display = "inline";
                parseSuccess.style.display = "inline";
                // Switch to small box
                resumeUploadBox.style.display = "none";
                resumeSmallBox.style.display = "flex";
                uploadedResumeName.textContent = file.name + " ✔";
                
            });

}).catch(err => {
            console.error("Error parsing resume:", err);
            parseLoading.style.display = "none";
            parseResumeBtn.disabled = false;
            showStatus("Failed to parse resume", "error");
        });
});
           

// Replace resume
replaceResumeBtn.addEventListener("click", function () {
   
        resumeInput.value = "";
        fileNameEl.textContent = "none";
        parseResumeBtn.style.display = "none";
        parseSuccess.style.display = "none";
        resumeUploadBox.style.display = "block";
        resumeSmallBox.style.display = "none";
});

}


// Load saved settings
function loadSavedSettings() {
    chrome.storage.local.get(['settingsType', 'customServerUrl', 'emailTemplate'], function(result) {
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
    });
}

// Preview email functionality
function previewEmail() {
    chrome.storage.local.get(['jobData'], function(result) {
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
    });
}

// Generate email content based on template
function generateEmailContent(jobDetails,forGmail = false) {

    
    let subject = jobDetails.subject;
    let body = jobDetails.body;
    
    if (forGmail) {
        return { subject, body };
    }
    
    return `<div><strong>Subject:</strong> ${subject}</div><hr><div style="white-space: pre-wrap;">${body}</div>`;
}

// Get current server URL based on configuration
function getCurrentServerUrl() {
    const settingsType = document.getElementById('settingsType').value;
    
    if (settingsType === 'default') {
        return `${baseurl}/mailservice`; // Default configuration from code
    } else {
        return document.getElementById('serverUrl').value;
    }
}

function sendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(response);
    });
  });
}

function getStorageData(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
}

async function sendToServer() {
  const serverUrl = getCurrentServerUrl();
//   const jobData = await chrome.storage.local.get('jobData');
const jobDataObj = await getStorageData('jobData');

  if (!serverUrl) {
    showStatus('Please configure a server URL', 'error');
    return;
  }

const selectedText = jobDataObj.jobData?.selectedText;
const pageUrl = jobDataObj.jobData?.pageUrl;
const pageTitle = jobDataObj.jobData?.pageTitle;
//const profile_data = jobDataObj.jobData?.profile_data

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


// If first time user → no resume uploaded


  showLoading(true);

  try {
    const response = await sendMessageAsync({
      action: 'sendToServer',
      serverUrl: serverUrl,
      data: { url: pageUrl, message: selectedText, title: pageTitle, resumeSummary: resumeSummary, profile_data:  profile_data }
    });

    showLoading(false);

    if (response && response.success) {
      showStatus('Successfully sent to server!', 'success');

      const jobDetails = {
        subject: response.data.subject,
        body: response.data.body,
        recipient_mail: response.data.recipient_mail,
        company_name: response.data.company_name,
        location: response.data.location,
        techstack: response.data.techstack
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
    showStatus(`Error: ${err.message}`, 'error');
  }
}


// Copy email to clipboard
function copyEmail() {
    const emailContent = document.getElementById('emailContent');
    const textContent = emailContent.textContent || emailContent.innerText;
    
    navigator.clipboard.writeText(textContent).then(function() {
        showStatus('Email content copied to clipboard!', 'success');
    }).catch(function(err) {
        showStatus('Failed to copy to clipboard', 'error');
        console.error('Copy failed:', err);
    });
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

// Show/hide loading indicator
function showLoading(show, message = 'Sending...') {
    const loadingEl = document.getElementById('loading');
    const sendBtn = document.getElementById('sendBtn');
    const gmailBtn = document.getElementById('gmailBtn');
    
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
}