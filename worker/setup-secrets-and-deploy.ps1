$ErrorActionPreference = "Stop"

function Read-RequiredSecret($name, $prefix) {
  $value = Read-Host "Paste $name ($prefix...)"
  if ([string]::IsNullOrWhiteSpace($value) -or -not $value.StartsWith($prefix)) {
    throw "$name must start with $prefix"
  }
  return $value.Trim()
}

$stripeSecret = Read-RequiredSecret "STRIPE_SECRET_KEY" "sk_"

$amountInput = Read-Host "Coin pack price in JPY cents/minor units [default: 500]"
if ([string]::IsNullOrWhiteSpace($amountInput)) { $amountInput = "500" }
$amount = [int]$amountInput

$headers = @{ Authorization = "Bearer $stripeSecret" }

Write-Host "Creating Stripe product..."
$product = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.stripe.com/v1/products" `
  -Headers $headers `
  -ContentType "application/x-www-form-urlencoded" `
  -Body "name=Vector%20Arcade%20Coin%20Pack"

Write-Host "Creating Stripe price..."
$priceBody = "currency=jpy&unit_amount=$amount&product=$($product.id)"
$price = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.stripe.com/v1/prices" `
  -Headers $headers `
  -ContentType "application/x-www-form-urlencoded" `
  -Body $priceBody

Write-Host "Creating Stripe webhook endpoint..."
$webhookBody = "url=https%3A%2F%2Fvector-arcade-coins.fuwafuwow.workers.dev%2Fwebhook&enabled_events[]=checkout.session.completed"
$webhook = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.stripe.com/v1/webhook_endpoints" `
  -Headers $headers `
  -ContentType "application/x-www-form-urlencoded" `
  -Body $webhookBody

$webhookSecret = $webhook.secret
$priceId = $price.id

if ([string]::IsNullOrWhiteSpace($webhookSecret) -or -not $webhookSecret.StartsWith("whsec_")) {
  throw "Stripe did not return a webhook signing secret."
}
if ([string]::IsNullOrWhiteSpace($priceId) -or -not $priceId.StartsWith("price_")) {
  throw "Stripe did not return a price id."
}

$stripeSecret | npx wrangler secret put STRIPE_SECRET_KEY
$webhookSecret | npx wrangler secret put STRIPE_WEBHOOK_SECRET
$priceId | npx wrangler secret put PRICE_ID_PACK_1

npm run deploy

$res = curl.exe -s -i -X POST https://vector-arcade-coins.fuwafuwow.workers.dev/checkout
$res

if ($res -notmatch "HTTP/1.1 200") {
  throw "Checkout endpoint is not returning 200. Check the error above."
}
