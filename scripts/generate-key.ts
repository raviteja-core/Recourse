import { generateKeyPair, exportJWK } from 'jose';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(1);
  }

  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const jwkString = JSON.stringify(privateJwk);

  let envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('MANDATE_SIGNING_PRIVATE_KEY=')) {
    envContent = envContent.replace(
      /MANDATE_SIGNING_PRIVATE_KEY=.*/,
      `MANDATE_SIGNING_PRIVATE_KEY='${jwkString}'`
    );
  } else {
    envContent += `\nMANDATE_SIGNING_PRIVATE_KEY='${jwkString}'\n`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('Successfully generated fresh ES256 key and updated MANDATE_SIGNING_PRIVATE_KEY in .env');
}

main().catch((err) => {
  console.error('Failed to generate key:', err.message);
  process.exit(1);
});

