// Content script for Job Email Helper extension

// Detect when text is selected
document.addEventListener('mouseup', function() {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText.length > 0) {
    // Store selection info for potential use
    chrome.storage.local.set({
      lastSelection: {
        text: selectedText,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    // Extract job-related information from the page
    const jobInfo = extractJobInformation();
    sendResponse({ jobInfo: jobInfo });
  }
  
  if (request.action === "highlightText") {
    // Highlight the selected text on the page
    highlightSelectedText(request.text);
    sendResponse({ success: true });
  }

    if (request.action === "openPopupWindow") {
    // Example: open a small popup/modal inside the current page
    showLoginSuccessPopup();
    sendResponse({ success: true });
  }

});

// Function to extract job information from the page
function extractJobInformation() {
  const jobInfo = {
    title: document.title,
    url: window.location.href,
    company: findCompanyName(),
    jobTitle: findJobTitle(),
    location: findLocation(),
    description: findJobDescription(),
    requirements: findRequirements()
  };
  
  return jobInfo;
}

// Helper functions to extract specific job information
function findCompanyName() {
  // Common selectors for company names
  const selectors = [
    '[data-testid*="company"]',
    '.company-name',
    '.employer-name',
    'h1 + div',
    '[class*="company"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  
  return null;
}

function findJobTitle() {
  // Common selectors for job titles
  const selectors = [
    'h1',
    '[data-testid*="job-title"]',
    '.job-title',
    '.position-title'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  
  return null;
}

function findLocation() {
  // Common selectors for location
  const selectors = [
    '[data-testid*="location"]',
    '.location',
    '.job-location',
    '[class*="location"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }
  
  return null;
}

function findJobDescription() {
  // Look for job description content
  const selectors = [
    '[data-testid*="description"]',
    '.job-description',
    '.description',
    '.job-details'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim().substring(0, 1000); // Limit length
    }
  }
  
  return null;
}

function findRequirements() {
  // Look for requirements or qualifications
  const text = document.body.textContent.toLowerCase();
  const requirementsKeywords = ['requirements', 'qualifications', 'skills', 'experience'];
  
  for (const keyword of requirementsKeywords) {
    const index = text.indexOf(keyword);
    if (index !== -1) {
      // Extract some text around the keyword
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + 500);
      return text.substring(start, end);
    }
  }
  
  return null;
}

function highlightSelectedText(text) {
  // Simple text highlighting function
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const textNodes = [];
  let node;
  
  while (node = walker.nextNode()) {
    if (node.textContent.includes(text)) {
      textNodes.push(node);
    }
  }
  
  textNodes.forEach(textNode => {
    const parent = textNode.parentNode;
    const content = textNode.textContent;
    const index = content.indexOf(text);
    
    if (index !== -1) {
      const beforeText = content.substring(0, index);
      const highlightedText = content.substring(index, index + text.length);
      const afterText = content.substring(index + text.length);
      
      const beforeNode = document.createTextNode(beforeText);
      const highlightNode = document.createElement('mark');
      highlightNode.style.backgroundColor = '#ffff00';
      highlightNode.textContent = highlightedText;
      const afterNode = document.createTextNode(afterText);
      
      parent.insertBefore(beforeNode, textNode);
      parent.insertBefore(highlightNode, textNode);
      parent.insertBefore(afterNode, textNode);
      parent.removeChild(textNode);
    }
  });
}

function showLoginSuccessPopup() {
  const popup = document.createElement('div');
  popup.textContent = "✅ Successfully logged in with Google!";
  popup.style.position = 'fixed';
  popup.style.bottom = '20px';
  popup.style.right = '20px';
  popup.style.background = '#28a745';
  popup.style.color = '#fff';
  popup.style.padding = '10px 15px';
  popup.style.borderRadius = '6px';
  popup.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  popup.style.zIndex = 9999;
  popup.style.fontSize = '14px';
  popup.style.fontFamily = 'sans-serif';

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 3000);
}
