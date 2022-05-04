export {};

declare global {
    namespace PlaywrightTest {
       interface TestFixtures {
         other: string | number;
       }
     }
   }
