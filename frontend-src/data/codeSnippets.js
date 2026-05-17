export const INITIAL_CPP = `#include <iostream>
using namespace std;

int main() {
  int n = 0;
  while (n < 5) {
    cout << n << endl;
    n++;
  }
  return 0;
}
`

export const INITIAL_ASM = `section .text
global _start

_start:
  mov rcx, 0      ; n = 0

.loop:
  cmp rcx, 5      ; if n >= 5
  jge .end        ; jump to end

  push rcx
  ; ... syscall write ...
  pop rcx

  inc rcx         ; n++
  jmp .loop

.end:
  mov rax, 60     ; sys_exit
  xor rdi, rdi
  syscall
`

export const INITIAL_CONSOLE = [
  { type: 'warn', text: '[ CYBER_DRIVE v1.0 — ALGORITHMIC_VPROG ]' },
  { type: 'info', text: 'FILE: noname.cpp — UNSAVED *' },
  { type: 'info', text: 'Listo. Presiona COMPILE_RUN para ejecutar.' },
  { type: 'info', text: '> _' },
]
