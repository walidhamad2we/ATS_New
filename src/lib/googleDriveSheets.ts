/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper functions to interact with Google Drive and Google Sheets APIs from the client-side

export async function findFolderByName(accessToken: string, folderName: string, parentId?: string): Promise<string | null> {
  const q = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : ""}`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      const error: any = new Error('UNAUTHENTICATED');
      error.status = 401;
      throw error;
    }
    return null;
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

export async function createFolder(accessToken: string, folderName: string, parentFolderId?: string): Promise<{ id: string }> {
  const body: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  if (parentFolderId) {
    body.parents = [parentFolderId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    if (response.status === 401) {
      const error: any = new Error('UNAUTHENTICATED');
      error.status = 401;
      throw error;
    }
    const errText = await response.text();
    const error: any = new Error(`Error creating folder: ${errText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function createSpreadsheet(accessToken: string, sheetName: string, parentFolderId?: string): Promise<{ id: string; spreadsheetUrl?: string }> {
  const body: any = {
    name: sheetName,
    mimeType: "application/vnd.google-apps.spreadsheet"
  };
  if (parentFolderId) {
    body.parents = [parentFolderId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    if (response.status === 401) {
      const error: any = new Error('UNAUTHENTICATED');
      error.status = 401;
      throw error;
    }
    const errText = await response.text();
    const error: any = new Error(`Error creating spreadsheet in Drive: ${errText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return {
    id: data.id,
    spreadsheetUrl: data.webViewLink
  };
}

export async function getFirstSheetTitle(accessToken: string, spreadsheetId: string): Promise<string> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.ok) {
    const data = await response.json();
    if (data.sheets && data.sheets[0] && data.sheets[0].properties) {
      return data.sheets[0].properties.title;
    }
    return "Sheet1";
  }

  if (response.status === 401) {
    const error: any = new Error('UNAUTHENTICATED');
    error.status = 401;
    throw error;
  }

  const errText = await response.text();
  console.error("Error fetching sheet title:", errText);
  return "Sheet1";
}

export async function setSpreadsheetHeaders(accessToken: string, spreadsheetId: string, headers: string[]): Promise<any> {
  const sheetTitle = await getFirstSheetTitle(accessToken, spreadsheetId);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range: `${sheetTitle}!A1`,
      majorDimension: "ROWS",
      values: [headers]
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      const error: any = new Error('UNAUTHENTICATED');
      error.status = 401;
      throw error;
    }
    const errText = await response.text();
    const error: any = new Error(`Error writing spreadsheet headers: ${errText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function appendSpreadsheetRow(accessToken: string, spreadsheetId: string, rowValues: any[]): Promise<any> {
  const sheetTitle = await getFirstSheetTitle(accessToken, spreadsheetId);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range: `${sheetTitle}!A1`,
      majorDimension: "ROWS",
      values: [rowValues]
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      const error: any = new Error('UNAUTHENTICATED');
      error.status = 401;
      throw error;
    }
    const errText = await response.text();
    const error: any = new Error(`Error appending row: ${errText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function uploadFileToDrive(accessToken: string, folderId: string, fileName: string, fileDataUrl: string): Promise<string> {
  // Use fetch to convert dataUrl to Blob - cleaner and works well for large files
  const res = await fetch(fileDataUrl);
  const base64Blob = await res.blob();
  const mimeType = base64Blob.type;

  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const metadataStr = JSON.stringify(metadata);
  const boundary = '-------' + Math.random().toString(36).substring(2);
  
  const header = 
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataStr}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
    
  const footer = `\r\n--${boundary}--`;
  
  const headerBlob = new Blob([header], {type: 'text/plain'});
  const footerBlob = new Blob([footer], {type: 'text/plain'});
  
  const multipartBlob = new Blob([headerBlob, base64Blob, footerBlob], {type: `multipart/related; boundary=${boundary}`});
  
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBlob
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      const error: any = new Error('UNAUTHENTICATED');
      error.status = 401;
      throw error;
    }
    const errText = await response.text();
    const error: any = new Error(`Failed to upload file to Google Drive: ${errText} (Status: ${response.status})`);
    error.status = response.status;
    throw error;
  }

  const result = await response.json();
  return result.webViewLink || `https://drive.google.com/open?id=${result.id}`;
}

export function extractFolderIdFromUrl(url: string): string {
  if (!url) return '';
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return url.trim();
}
