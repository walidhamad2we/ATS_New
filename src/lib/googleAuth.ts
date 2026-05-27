/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { get, set, del } from 'idb-keyval';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Workspace scopes for Drive and Sheets
provider.addScope("https://www.googleapis.com/auth/drive");
provider.addScope("https://www.googleapis.com/auth/spreadsheets");

const TOKEN_STORAGE_KEY = 'google_access_token_v1';
const TOKEN_TIME_KEY = 'google_access_token_time_v1';

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // Try to recover token from IndexedDB first
      if (!cachedAccessToken) {
        const storedToken = await get<string>(TOKEN_STORAGE_KEY);
        const storedTime = await get<number>(TOKEN_TIME_KEY);
        
        // Google access tokens typically expire in 3600 seconds. 
        // We use a 50-minute buffer to be safe.
        const isFresh = storedTime && (Date.now() - storedTime < 50 * 60 * 1000);
        
        if (storedToken && isFresh) {
          cachedAccessToken = storedToken;
        } else {
          cachedAccessToken = null;
          await del(TOKEN_STORAGE_KEY);
          await del(TOKEN_TIME_KEY);
        }
      }

      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      await del(TOKEN_STORAGE_KEY);
      await del(TOKEN_TIME_KEY);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to obtain Google access token from Firebase Auth");
    }

    cachedAccessToken = credential.accessToken;
    // Persist with timestamp to handle expiration
    await set(TOKEN_STORAGE_KEY, cachedAccessToken);
    await set(TOKEN_TIME_KEY, Date.now());
    
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    const storedToken = await get<string>(TOKEN_STORAGE_KEY);
    const storedTime = await get<number>(TOKEN_TIME_KEY);
    const isFresh = storedTime && (Date.now() - storedTime < 50 * 60 * 1000);
    
    if (storedToken && isFresh) {
      cachedAccessToken = storedToken;
    } else {
      cachedAccessToken = null;
    }
  }
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  await del(TOKEN_STORAGE_KEY);
  await del(TOKEN_TIME_KEY);
};
