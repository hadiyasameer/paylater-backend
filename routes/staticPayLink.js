import express from 'express';
import { getPayLaterLink } from '../controllers/paylaterLinkController.js';

const router = express.Router();

router.get('/paylater-checkout', getPayLaterLink);

export default router;
