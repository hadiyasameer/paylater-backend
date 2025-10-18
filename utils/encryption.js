import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '32_characters_long_key!'; // Must be 32 chars
const IV_LENGTH = 16; // AES block size

export function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text) {
    if (!text) return text;
    const [ivHex, encryptedData] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
