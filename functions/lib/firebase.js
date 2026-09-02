const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const {
  FieldPath,
  FieldValue,
  getFirestore,
} = require('firebase-admin/firestore');

if (getApps().length === 0) initializeApp();

module.exports = {
  auth: getAuth(),
  db: getFirestore(),
  FieldPath,
  FieldValue,
};
