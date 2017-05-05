(module

  (import "memory" "main" (memory 0))
  
  (global $ptr<reserved> (import "ptr" "inflateTables") i32)

  (global $CODES (export "CODES") i32 i32.const 0)
  (global $LENS (export "LENS") i32 i32.const 1)
  (global $DISTS (export "DISTS") i32 i32.const 2)
  
  (global $MAXBITS i32 i32.const 15)

  (global $ptr<codeLengthPermutations> (mut i32) i32.const -1)
  (global $sizeof<codeLengthPermutations> i32 i32.const 19)
  
  (global $ptr<lengthCodes257_285Base> (mut i32) i32.const -1)
  (global $sizeof<lengthCodes257_285Base> i32 i32.const 62)
  
  (global $ptr<lengthCodes257_285Extra> (mut i32) i32.const -1)
  (global $sizeof<lengthCodes257_285Extra> i32 i32.const 62)
  
  (global $ptr<distanceCodes0_29Base> (mut i32) i32.const -1)
  (global $sizeof<distanceCodes0_29Base> i32 i32.const 64)
  
  (global $ptr<distanceCodes0_29Extra> (mut i32) i32.const -1)
  (global $sizeof<distanceCodes0_29Extra> i32 i32.const 64)
  
  (global $ptr<codesOfLength> (mut i32) i32.const -1)
  (global $sizeof<codesOfLength> i32 i32.const 32)
  
  (global $ptr<workspace> (mut i32) i32.const -1)
  (global $sizeof<workspace> i32 i32.const 576)
  
  (global $ptr<lengthTableOffsets> (mut i32) i32.const -1)
  (global $sizeof<lengthTableOffsets> i32 i32.const 32)
  
  (global $ptr<fixedLengthTable> (mut i32) i32.const -1)
  (global $sizeof<fixedLengthTable> i32 i32.const 2048)
  
  (global $ptr<fixedDistanceTable> (mut i32) i32.const -1)
  (global $sizeof<fixedDistanceTable> i32 i32.const 128)
  
  (global $sizeof<dynamicLengthTable> i32 i32.const 3408)
  (global $sizeof<dynamicDistanceTable> i32 i32.const 2368)
  
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

  (func $write_i16 (param $ptr i32) (param $v i32) (result i32)
    (i32.store16 (get_local $ptr) (get_local $v))
    (return (i32.add (get_local $ptr) (i32.const 2)))
  )

  (func $write_i16_n (param $ptr i32) (param $v i32) (param $n i32) (result i32)
    block
      loop
        (br_if 1 (i32.eqz (get_local $n)))
        (i32.store16 (get_local $ptr) (get_local $v))
        (set_local $ptr (i32.add (get_local $ptr) (i32.const 2)))
        (set_local $n (i32.sub (get_local $n) (i32.const 1)))
        br 0
      end
    end
    (return (get_local $ptr))
  )

  (func $init
    (local $ptr i32)

    (set_global $ptr<codeLengthPermutations> (tee_local $ptr (get_global $ptr<reserved>)))
    
    (get_local $ptr)
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
      (call $align16)
    (set_global $ptr<lengthCodes257_285Base> (tee_local $ptr))
    
    (get_local $ptr)
      (call $write_i16 (i32.const 3))
      (call $write_i16 (i32.const 4))
      (call $write_i16 (i32.const 5))
      (call $write_i16 (i32.const 6))
      (call $write_i16 (i32.const 7))
      (call $write_i16 (i32.const 8))
      (call $write_i16 (i32.const 9))
      (call $write_i16 (i32.const 10))
      (call $write_i16 (i32.const 11))
      (call $write_i16 (i32.const 13))
      (call $write_i16 (i32.const 15))
      (call $write_i16 (i32.const 17))
      (call $write_i16 (i32.const 19))
      (call $write_i16 (i32.const 23))
      (call $write_i16 (i32.const 27))
      (call $write_i16 (i32.const 31))
      (call $write_i16 (i32.const 35))
      (call $write_i16 (i32.const 43))
      (call $write_i16 (i32.const 51))
      (call $write_i16 (i32.const 59))
      (call $write_i16 (i32.const 67))
      (call $write_i16 (i32.const 83))
      (call $write_i16 (i32.const 99))
      (call $write_i16 (i32.const 115))
      (call $write_i16 (i32.const 131))
      (call $write_i16 (i32.const 163))
      (call $write_i16 (i32.const 195))
      (call $write_i16 (i32.const 227))
      (call $write_i16 (i32.const 258))
      (call $write_i16 (i32.const 0))
      (call $write_i16 (i32.const 0))
    (set_global $ptr<lengthCodes257_285Extra> (tee_local $ptr))
    
    (get_local $ptr)
      (call $write_i16_n (i32.const 16) (i32.const 8))
      (call $write_i16_n (i32.const 17) (i32.const 4))
      (call $write_i16_n (i32.const 18) (i32.const 4))
      (call $write_i16_n (i32.const 19) (i32.const 4))
      (call $write_i16_n (i32.const 20) (i32.const 4))
      (call $write_i16_n (i32.const 21) (i32.const 4))
      (call $write_i16 (i32.const 16))
      (call $write_i16 (i32.const 77))
      (call $write_i16 (i32.const 202))
    (set_global $ptr<distanceCodes0_29Base> (tee_local $ptr))
    
    (get_local $ptr)
      (call $write_i16 (i32.const 1))
      (call $write_i16 (i32.const 2))
      (call $write_i16 (i32.const 3))
      (call $write_i16 (i32.const 4))
      (call $write_i16 (i32.const 5))
      (call $write_i16 (i32.const 7))
      (call $write_i16 (i32.const 9))
      (call $write_i16 (i32.const 13))
      (call $write_i16 (i32.const 17))
      (call $write_i16 (i32.const 25))
      (call $write_i16 (i32.const 33))
      (call $write_i16 (i32.const 49))
      (call $write_i16 (i32.const 65))
      (call $write_i16 (i32.const 97))
      (call $write_i16 (i32.const 129))
      (call $write_i16 (i32.const 193))
      (call $write_i16 (i32.const 257))
      (call $write_i16 (i32.const 385))
      (call $write_i16 (i32.const 513))
      (call $write_i16 (i32.const 769))
      (call $write_i16 (i32.const 1025))
      (call $write_i16 (i32.const 1537))
      (call $write_i16 (i32.const 2049))
      (call $write_i16 (i32.const 3073))
      (call $write_i16 (i32.const 4097))
      (call $write_i16 (i32.const 6145))
      (call $write_i16 (i32.const 8193))
      (call $write_i16 (i32.const 12289))
      (call $write_i16 (i32.const 16385))
      (call $write_i16 (i32.const 24577))
      (call $write_i16 (i32.const 0))
      (call $write_i16 (i32.const 0))
    (set_global $ptr<distanceCodes0_29Extra> (tee_local $ptr))
    
    (get_local $ptr)
      (call $write_i16_n (i32.const 16) (i32.const 4))
      (call $write_i16_n (i32.const 17) (i32.const 2))
      (call $write_i16_n (i32.const 18) (i32.const 2))
      (call $write_i16_n (i32.const 19) (i32.const 2))
      (call $write_i16_n (i32.const 20) (i32.const 2))
      (call $write_i16_n (i32.const 21) (i32.const 2))
      (call $write_i16_n (i32.const 22) (i32.const 2))
      (call $write_i16_n (i32.const 23) (i32.const 2))
      (call $write_i16_n (i32.const 24) (i32.const 2))
      (call $write_i16_n (i32.const 25) (i32.const 2))
      (call $write_i16_n (i32.const 26) (i32.const 2))
      (call $write_i16_n (i32.const 27) (i32.const 2))
      (call $write_i16_n (i32.const 28) (i32.const 2))
      (call $write_i16_n (i32.const 29) (i32.const 2))
      (call $write_i16_n (i32.const 64) (i32.const 2))
    (set_global $ptr<codesOfLength> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<codesOfLength>))
    (set_global $ptr<lengthTableOffsets> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<lengthTableOffsets>))
    (set_global $ptr<workspace> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<workspace>))
    (set_global $ptr<unreserved>)
    
    ;; (call $buildFixedTables (get_global $ptr<unreserved>))
  )
  
  (func $buildFixedTables (export "buildFixedTables") (param $ptr<temp> i32)
    ;; fixed length table
    (get_local $ptr<temp>)
      (call $write_i16_n (i32.const 8) (i32.const 144))
      (call $write_i16_n (i32.const 9) (i32.const 112))
      (call $write_i16_n (i32.const 7) (i32.const 24))
      (call $write_i16_n (i32.const 8) (i32.const 8))
    drop
    (call $buildTable
      (get_global $ptr<fixedLengthTable>)
      (get_global $LENS)
      (i32.const 9)
      (get_local $ptr<temp>)
      (i32.mul (i32.const 288) (i32.const 2))
    )
    drop
    
    ;; fixed distance table
    (get_local $ptr<temp>)
      (call $write_i16_n (i32.const 5) (i32.const 32))
    drop
    (call $buildTable
      (get_global $ptr<fixedDistanceTable>)
      (get_global $DISTS)
      (i32.const 5)
      (get_local $ptr<temp>)
      (i32.mul (i32.const 32) (i32.const 2))
    )
    drop
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
  
  (func (export "sizeof_dynamicDistanceTable") (result i32)
    (return (get_global $sizeof<dynamicDistanceTable>))
  )

  (func (export "sizeof_dynamicLengthTable") (result i32)
    (return (get_global $sizeof<dynamicLengthTable>))
  )
  
  (func $clear_codesOfLength
    (call $write_i16_n
      (get_global $ptr<codesOfLength>)
      (i32.const 0)
      (i32.add (get_global $MAXBITS) (i32.const 1))
    )
    drop
  )
  
  (func $getCodeOfLengthPtr (param $i i32) (result i32)
    (return (i32.add
      (get_global $ptr<codesOfLength>)
      (i32.mul (get_local $i) (i32.const 2))
    ))
  )
  
  (func $inc_codeOfLength (param $i i32)
    (local $ptr i32)
    (set_local $ptr (call $getCodeOfLengthPtr (get_local $i)))
    (i32.store16 (get_local $ptr) (i32.add
      (i32.load16_u (get_local $ptr))
      (i32.const 1)
    ))
  )

  (func $countCodesOfLength (param $i i32) (result i32)
    (return (i32.load16_u (call $getCodeOfLengthPtr (get_local $i))))
  )
  
  (func $setLengthTableOffset (param $i i32) (param $v i32)
    (i32.store16
      (i32.add
        (get_global $ptr<lengthTableOffsets>)
        (i32.mul (get_local $i) (i32.const 2))
      )
      (get_local $v)
    )
  )

  (func $getLengthTableOffset (param $i i32) (result i32)
    (return (i32.load16_u (i32.add
      (get_global $ptr<lengthTableOffsets>)
      (i32.mul (get_local $i) (i32.const 2))
    )))
  )

  (func $code (param $op i32) (param $bits i32) (param $val i32) (result i32)
    (return (i32.or
      (i32.shl (get_local $val) (i32.const 16))
      (i32.or
        (i32.shl (i32.and (get_local $bits) (i32.const 255)) (i32.const 8))
        (i32.and (get_local $op) (i32.const 255))
      )
    ))
  )
  
  (func $write_code (param $ptr i32) (param $op i32) (param $bits i32) (param $val i32) (result i32)
    (i32.store (get_local $ptr) (call $code (get_local $op) (get_local $bits) (get_local $val)))
    (return (i32.add (get_local $ptr) (i32.const 4)))
  )

  (func $buildTable (export "buildTable")
    (param $ptr<table> i32)
    (param $mode i32)
    (param $bitWidth i32)
    (param $ptr<lens> i32)
    (param $sizeof<lens> i32)
    (result i32)
    (local $ptr i32)
    (local $ptr<end> i32)
    (local $root i32)
    (local $max i32)
    (local $min i32)
    (local $left i32)
    (local $len i32)
    (local $huff i32)
    (local $ptr<next> i32)
    (local $drop i32)
    
    ;; populate codesOfLength
    (call $clear_codesOfLength)
    (set_local $ptr<end> (i32.add (tee_local $ptr (get_local $ptr<lens>)) (get_local $sizeof<lens>)))
    block
      loop
        (br_if 1 (i32.ge_u (get_local $ptr) (get_local $ptr<end>)))
        (call $inc_codeOfLength (i32.load16_u (get_local $ptr)))
        (set_local $ptr (i32.add (get_local $ptr) (i32.const 2)))
        br 0
      end
    end
    
    ;; find max
    (set_local $root (get_local $bitWidth))
    (set_local $ptr (call $getCodeOfLengthPtr (get_global $MAXBITS)))
    (set_local $ptr<end> (get_global $ptr<codesOfLength>))
    block
      loop
        (br_if 1 (i32.load16_u (get_local $ptr)))
        (br_if 0 (i32.gt_u (tee_local $ptr (i32.sub (get_local $ptr) (i32.const 2))) (get_local $ptr<end>)))
      end
    end
    (set_local $max (i32.div_u (i32.sub (get_local $ptr) (get_global $ptr<codesOfLength>)) (i32.const 2)))
    
    ;; make sure root is no greater than max
    (if (i32.gt_u (get_local $root) (get_local $max)) (then
      (set_local $root (get_local $max))
    ))
    
    (if (i32.eqz (get_local $max)) (then
      ;; no symbols. set an invalid code number and wait for decoding to report an error
      (tee_local $ptr (get_local $ptr<table>))
        (call $write_code (i32.const 64) (i32.const 1) (i32.const 0))
        (call $write_code (i32.const 64) (i32.const 1) (i32.const 0))
      drop
      (return (i32.const 1))
    ))
    
    ;; find min
    (set_local $ptr<end> (get_local $ptr)) ;; $ptr is $ptr<max>
    (set_local $ptr (call $getCodeOfLengthPtr (i32.const 1)))
    block
      loop
        (br_if 1 (i32.load16_u (get_local $ptr)))
        (br_if 0 (i32.lt_u (tee_local $ptr (i32.add (get_local $ptr) (i32.const 2))) (get_local $ptr<end>)))
      end
    end
    (set_local $min (i32.div_u (i32.sub (get_local $ptr) (get_global $ptr<codesOfLength>)) (i32.const 2)))
    
    ;; make sure root is no less than min
    (if (i32.lt_u (get_local $root) (get_local $min)) (then
      (set_local $root (get_local $min))
    ))
    
    ;; check: over-subscribed
    (set_local $left (i32.const 1))
    (set_local $len (i32.const 1))
    loop
      (set_local $left (i32.shl (get_local $left) (i32.const 1)))
      (set_local $left (i32.sub (get_local $left) (call $countCodesOfLength (get_local $len))))
      (if (i32.lt_s (get_local $left) (i32.const 0)) (then
        unreachable
      ))
      (br_if 0 (i32.le_u (tee_local $len (i32.add (get_local $len) (i32.const 1))) (get_global $MAXBITS)))
    end
    
    ;; check: incomplete set of lengths
    (if (i32.gt_s (get_local $left) (i32.const 0)) (then
      block
        (br_if 0 (i32.eq (get_local $mode) (get_global $CODES)))
        (br_if 0 (i32.ne (get_local $max) (i32.const 1)))
        br 1
      end
      unreachable
    ))
    
    ;; generate offsets into symbol table for each length for sorting
    (call $setLengthTableOffset (i32.const 0) (i32.const 0))
    (call $setLengthTableOffset (i32.const 1) (i32.const 0))
    (set_local $len (i32.const 1))
    loop
      (call $setLengthTableOffset (i32.add (get_local $len) (i32.const 1))
        (i32.add
          (call $getLengthTableOffset (get_local $len))
          (call $countCodesOfLength (get_local $len))
        )
      )
      (br_if 0 (i32.lt_u (tee_local $len (i32.add (get_local $len) (i32.const 1))) (get_global $MAXBITS)))
    end
    
    ;; TODO
    
    (if (get_local $huff) (then
      ;; fill in remaining table entry if code is incomplete (guaranteed to have
      ;; at most one remaining entry, since if the code is incomplete, the
      ;; maximum code length that was allowed to get this far is one bit)
      get_local $ptr<table>
      (call $write_code
        (i32.const 64) ;; invalid code marker
        (i32.sub (get_local $len) (get_local $drop))
        (i32.const 0)
      )
      drop
    ))
    
    (return (get_local $root))
  )

  (start $init)

)
