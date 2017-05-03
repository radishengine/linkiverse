(module

  (import "memory" "main" (memory 0))

  (global $ptr<reserved> (import "ptr" "inflateTables") i32)

  (global $ptr<codeLengthPermutations> (mut i32) i32.const -1)
  (global $sizeof<codeLengthPermutations> i32 i32.const 19)

  (global $ptr<unreserved> (mut i32) i32.const -1)

  (func $alignMask (param $ptr i32) (param $mask i32) (result i32)
    block
      loop
        (br_if 1 (i32.eqz (i32.and (get_local $ptr) (get_local $mask))))
        (set_local $ptr (i32.add (get_local $ptr) (i32.const 1)))
        br 0
      end
    end
    (return (get_local $ptr))
  )
  (func $align16 (param i32) (result i32) (return (call $alignMask (get_local 0) (i32.const 1))))
  (func $align32 (param i32) (result i32) (return (call $alignMask (get_local 0) (i32.const 3))))

  (func $write_i8 (param $ptr i32) (param $v i32) (result i32)
    (i32.store8 (get_local $ptr) (get_local $v))
    (return (i32.add (get_local $ptr) (i32.const 1)))
  )

  (func $init
    (local $ptr i32)

    (tee_local $ptr (get_global $ptr<reserved>))
    (set_global $ptr<codeLengthPermutations> (get_local $ptr))
      (call $write_i8 (i32.const 16))
      (call $write_i8 (i32.const 17))
      (call $write_i8 (i32.const 18))
      (call $write_i8 (i32.const 0))
      (call $write_i8 (i32.const 8))
      (call $write_i8 (i32.const 7))
      (call $write_i8 (i32.const 9))
      (call $write_i8 (i32.const 6))
      (call $write_i8 (i32.const 10))
      (call $write_i8 (i32.const 5))
      (call $write_i8 (i32.const 11))
      (call $write_i8 (i32.const 4))
      (call $write_i8 (i32.const 12))
      (call $write_i8 (i32.const 3))
      (call $write_i8 (i32.const 13))
      (call $write_i8 (i32.const 2))
      (call $write_i8 (i32.const 14))
      (call $write_i8 (i32.const 1))
      (call $write_i8 (i32.const 15))
    (set_global $ptr<unreserved>)
  )

  (func (export "ptr_codeLengthPermutations") (result i32)
    (return (get_global $ptr<codeLengthPermutations>))
  )

  (func (export "sizeof_codeLengthPermutations") (result i32)
    (return (get_global $sizeof<codeLengthPermutations>))
  )

  (func (export "ptr_unreserved") (result i32)
    (return (get_global $ptr<unreserved>))
  )

  (start $init)

)
