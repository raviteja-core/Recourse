import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

import { createVaultSetupToken, exchangeVaultSetupToken } from '../lib/paypal/vault';
import { getDb } from '../lib/db';

async function main() {
  console.log('================================================================');
  console.log('=== RECOURSE: PAYPAL VAULT SETUP (FOR JUDGES & EVALUATORS) ===');
  console.log('================================================================\n');

  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    console.error('ERROR: Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env');
    console.error('Please configure your PayPal Sandbox credentials in .env first.');
    process.exit(1);
  }

  console.log('Creating Vault Setup Token with PayPal Sandbox API...');
  const returnUrl = 'http://localhost:3000/api/vault/return';
  const setupResult = await createVaultSetupToken(returnUrl);

  console.log('\n----------------------------------------------------------------');
  console.log('1. OPEN THIS APPROVAL URL IN A BROWSER (OR INCOGNITO WINDOW):');
  console.log(`\n   ${setupResult.approveUrl}\n`);
  console.log('2. Log in with your US buyer sandbox account and approve agreement.');
  console.log('3. PayPal will redirect to: http://localhost:3000/api/vault/return?approval_token_id=...');
  console.log('----------------------------------------------------------------\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, resolve));

  const answer = await promptUser(
    'Paste the approval_token_id from the return URL (or press Enter if completed via browser): '
  );

  const approvalTokenId = answer.trim() || setupResult.setupTokenId;

  console.log(`\nExchanging token (${approvalTokenId}) for permanent Vault Payment Token...`);
  try {
    const exchangeResult = await exchangeVaultSetupToken(approvalTokenId);
    console.log('\n================================================================');
    console.log('✓ VAULT SETUP SUCCESSFUL!');
    console.log(`Payment Token ID : ${exchangeResult.paymentTokenId}`);
    if (exchangeResult.customerId) {
      console.log(`Customer ID      : ${exchangeResult.customerId}`);
    }
    console.log(`Status           : ${exchangeResult.status}`);
    console.log('Saved to Recourse SQLite database for user: Alex Mercer');
    console.log('Recourse is now authorized to execute autonomous guarded purchases.');
    console.log('================================================================\n');
  } catch (err: any) {
    // If browser return already completed the exchange:
    const db = getDb();
    const user = db.prepare('SELECT vault_token_id, vault_status FROM users WHERE id = ?').get('user-1') as any;
    if (user?.vault_token_id) {
      console.log('\n================================================================');
      console.log('✓ VAULT SETUP CONFIRMED VIA BROWSER RETURN!');
      console.log(`Active Token ID  : ${user.vault_token_id}`);
      console.log(`Status           : ${user.vault_status}`);
      console.log('================================================================\n');
    } else {
      console.error(`\nFailed to complete vault exchange: ${err.message}`);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('Vault setup script error:', err.message);
  process.exit(1);
});
