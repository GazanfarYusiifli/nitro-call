import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
    window.Buffer = window.Buffer || Buffer;
    window.global = window.global || window;
    window.process = window.process || { env: {} };
}
