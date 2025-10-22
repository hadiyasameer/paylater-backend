export const isValidShopDomain = (shop) => {
  const regex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
  return regex.test(shop);
};
