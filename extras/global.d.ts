export {};

declare global {
    namespace PlaywrightTest {
       interface Matchers<R, T> {
         toBeAwesome(a: number, b: number): R;
       }

       interface TestFixtures {
         mount: () => Promise<number|string>;
       }
     }
   }
