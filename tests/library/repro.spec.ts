import { test, expect } from '@playwright/test';

test.only('focus', async ({ page }) => {

  // Go to https://semantic-ui.com/modules/dropdown.html#/definition
  await page.goto('https://semantic-ui.com/modules/dropdown.html#/definition');

  // Click text=Selection A dropdown can be used to select between choices in a form Selection d >> i >> nth=1
  await page.locator('[class="ui selection dropdown"]', {hasText: 'Gender'}).nth(0).click();

  // Click .menu.transition.visible > div >> nth=0

  await page.locator('.menu.transition.visible > div').first().focus();
  await page.locator('.menu.transition.visible > div').first().click();

  // Click text=Gender Male Female GenderMaleFemale
  await page.locator('text=Gender Male Female GenderMaleFemale').click();

  // Click text=MaleFemale >> div >> nth=1
  await page.locator('text=MaleFemale >> div').nth(1).click();

  // Click text=Select Friend Jenny Hess Elliot Fu Stevie Feliciano Christian Matt Justen Kitsun >> i
  await page.locator('text=Select Friend Jenny Hess Elliot Fu Stevie Feliciano Christian Matt Justen Kitsun >> i').click();

  // Click text=Stevie Feliciano >> nth=0
  await page.locator('text=Stevie Feliciano').first().click();

  // Click .ui.fluid.search > .dropdown >> nth=0
  await page.locator('.ui.fluid.search > .dropdown').first().click();

  // Click [class="ui fluid search selection dropdown active visible"] .item', {hasText: 'Algeria'}
  await page.locator('[class="ui fluid search selection dropdown active visible"] .item', {hasText: 'Algeria'}).click();

});
