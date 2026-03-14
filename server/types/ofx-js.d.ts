declare module "ofx-js" {
  export function parse(ofxString: string): Promise<any>;
}
