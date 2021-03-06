(module

  (import "memory" "main" (memory 0))
  
  (global $ptr<reserved> (import "ptr" "inflateTables") i32)

  (global $CODES (export "CODES") i32 i32.const 0)
  (global $LENS (export "LENS") i32 i32.const 1)
  (global $DISTS (export "DISTS") i32 i32.const 2)
  
  (global $ENOUGH_LENS (export "ENOUGH_LENS") i32 i32.const 852)
  (global $ENOUGH_DISTS (export "ENOUGH_DISTS") i32 i32.const 592)
  
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
  
  (global $ptr<literalLengthLens> (mut i32) i32.const -1)
  (global $sizeof<literalLengthLens> i32 i32.const 576)
  
  (global $ptr<distanceLens> (mut i32) i32.const -1)
  (global $sizeof<distanceLens> i32 i32.const 64)
  
  (global $ptr<codeLens> (mut i32) i32.const -1)
  (global $sizeof<codeLens> i32 i32.const 38)
  
  (global $ptr<workspace> (mut i32) i32.const -1)
  (global $sizeof<workspace> i32 i32.const 576)
  
  (global $ptr<lengthTableOffsets> (mut i32) i32.const -1)
  (global $sizeof<lengthTableOffsets> i32 i32.const 32)
  
  (global $ptr<fixedLengthTable> (mut i32) i32.const -1)
  (global $sizeof<fixedLengthTable> i32 i32.const 2048)
  
  (global $ptr<fixedDistanceTable> (mut i32) i32.const -1)
  (global $sizeof<fixedDistanceTable> i32 i32.const 128)
  
  (global $sizeof<dynamicCodeTable> i32 i32.const 1280) (; inflate.h: lens[320] ;)
  (global $sizeof<dynamicLengthTable> i32 i32.const 3408)
  (global $sizeof<dynamicDistanceTable> i32 i32.const 2368)
  
  (global $ptr<unreserved> (mut i32) i32.const -1)
  
  (global $ptr<lastTableEnd> (mut i32) i32.const -1)
  (global $lastTableBits (mut i32) i32.const 0)

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
    (set_global $ptr<literalLengthLens> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<literalLengthLens>))
    (set_global $ptr<distanceLens> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<distanceLens>))
    (set_global $ptr<codeLens> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<codeLens>))
    (set_global $ptr<workspace> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<workspace>))
    (set_global $ptr<fixedLengthTable> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<fixedLengthTable>))
    (set_global $ptr<fixedDistanceTable> (tee_local $ptr))
    
    (get_local $ptr)
      (i32.add (get_global $sizeof<fixedDistanceTable>))
    (set_global $ptr<unreserved>)
    
    (call $buildFixedLengthTable)
    (call $buildFixedDistanceTable)
  )
  
  (func $buildFixedLengthTable
    (local $ptr<temp> i32)
    (local $end<temp> i32)
    (get_global $ptr<literalLengthLens>)
      (call $write_i16_n (i32.const 8) (i32.const 144))
      (call $write_i16_n (i32.const 9) (i32.const 112))
      (call $write_i16_n (i32.const 7) (i32.const 24))
      (call $write_i16_n (i32.const 8) (i32.const 8))
    drop
    (call $buildTable
      (get_global $ptr<fixedLengthTable>)
      (get_global $LENS)
      (i32.const 9)
      (get_global $ptr<literalLengthLens>)
      (get_global $sizeof<literalLengthLens>)
    )
    (; to match inffixed.h, replace 99th of every 128 ops with 64 ;)
    (; https://github.com/madler/zlib/blob/v1.2.11/inflate.c#L362 ;)
    (set_local $ptr<temp> (i32.add (get_global $ptr<fixedLengthTable>) (i32.mul (i32.const 99) (i32.const 4))))
    (set_local $end<temp> (i32.add (get_global $ptr<fixedLengthTable>) (get_global $sizeof<fixedLengthTable>)))
    loop
      (i32.store8 (get_local $ptr<temp>) (i32.const 64))
      (br_if 0 (i32.lt_u
        (tee_local $ptr<temp> (i32.add
          (get_local $ptr<temp>)
          (i32.const 512) (; 128 * sizeof<code> ;)
        ))
        (get_local $end<temp>)
      ))
    end
  )
  
  (func $buildFixedDistanceTable
    (get_global $ptr<distanceLens>)
      (call $write_i16_n (i32.const 5) (i32.const 32))
    drop
    (call $buildTable
      (get_global $ptr<fixedDistanceTable>)
      (get_global $DISTS)
      (i32.const 5)
      (get_global $ptr<distanceLens>)
      (get_global $sizeof<distanceLens>)
    )
  )

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
  
  (func (export "ptr_fixedLengthTable") (result i32)
    (return (get_global $ptr<fixedLengthTable>))
  )
  
  (func (export "sizeof_fixedLengthTable") (result i32)
    (return (get_global $sizeof<fixedLengthTable>))
  )
  
  (func (export "ptr_fixedDistanceTable") (result i32)
    (return (get_global $ptr<fixedDistanceTable>))
  )
  
  (func (export "sizeof_fixedDistanceTable") (result i32)
    (return (get_global $sizeof<fixedDistanceTable>))
  )
  
  (func (export "ptr_lastTableEnd") (result i32)
    (return (get_global $ptr<lastTableEnd>))
  )
  
  (func (export "get_lastTableBits") (result i32)
    (return (get_global $lastTableBits))
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
  
  (func $getCodeOfLength (param $i i32) (result i32)
    (return (i32.load16_u (call $getCodeOfLengthPtr (get_local $i))))
  )
  
  (func $inc_codeOfLength (param $i i32)
    (local $ptr i32)
    (set_local $ptr (call $getCodeOfLengthPtr (get_local $i)))
    (i32.store16 (get_local $ptr) (i32.add
      (i32.load16_u (get_local $ptr))
      (i32.const 1)
    ))
  )

  (func $dec_codeOfLength (param $i i32) (result i32)
    (local $ptr i32)
    (local $val i32)
    (set_local $ptr (call $getCodeOfLengthPtr (get_local $i)))
    (set_local $val (i32.sub (i32.load16_u (get_local $ptr)) (i32.const 1)))
    (i32.store16 (get_local $ptr) (get_local $val))
    (return (get_local $val))
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

  (func $setWork (param $i i32) (param $v i32)
    (i32.store16
      (i32.add
        (get_global $ptr<workspace>)
        (i32.mul (get_local $i) (i32.const 2))
      )
      (get_local $v)
    )
  )

  (func $getWork (param $i i32) (result i32)
    (return (i32.load16_u (i32.add
      (get_global $ptr<workspace>)
      (i32.mul (get_local $i) (i32.const 2))
    )))
  )

  (func $getLengthTableOffset (param $i i32) (result i32)
    (return (i32.load16_u (i32.add
      (get_global $ptr<lengthTableOffsets>)
      (i32.mul (get_local $i) (i32.const 2))
    )))
  )

  (func $incLengthTableOffset (param $i i32) (result i32)
    (local $ptr i32)
    (local $v i32)
    (set_local $ptr (i32.add
      (get_global $ptr<lengthTableOffsets>)
      (i32.mul (get_local $i) (i32.const 2))
    ))
    (set_local $v (i32.load16_u (get_local $ptr)))
    (i32.store16 (get_local $ptr) (i32.add (get_local $v) (i32.const 1)))
    (return (get_local $v))
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
    (local $sym i32)
    (local $match i32)
    (local $ptr<base> i32)
    (local $ptr<extra> i32)
    (local $curr i32)
    (local $low i32)
    (local $used i32)
    (local $mask i32)
    (local $here_op i32)
    (local $here_bits i32)
    (local $here_val i32)
    (local $incr i32)
    (local $fill i32)
    (local $work i32)
    
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
      (get_local $ptr<table>)
        (call $write_code (i32.const 64) (i32.const 1) (i32.const 0))
        (call $write_code (i32.const 64) (i32.const 1) (i32.const 0))
      (set_global $ptr<lastTableEnd>)
      (set_global $lastTableBits (i32.const 1))
      return
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
    
    ;; sort symbols by length, by symbol order within each length
    (set_local $sym (i32.const 0))
    (set_local $ptr<end> (i32.add (get_local $ptr<lens>) (get_local $sizeof<lens>)))
    block
      loop
        (set_local $ptr (i32.add (get_local $ptr<lens>) (i32.mul (get_local $sym) (i32.const 2))))
        (br_if 1 (i32.ge_u (get_local $ptr) (get_local $ptr<end>)))
        (set_local $len (i32.load16_u (get_local $ptr)))
        (if (get_local $len) (then
          (call $setWork (call $incLengthTableOffset (get_local $len)) (get_local $sym))
        ))
        (set_local $sym (i32.add (get_local $sym) (i32.const 1)))
        br 0
      end
    end
    
    block $break
      block $DISTS: block $LENS: block $CODES:
      get_local $mode
      br_table $CODES: $LENS: $DISTS:
      end $CODES:
        ;; $ptr<base> and $ptr<extra> unused
        (set_local $ptr<base> (get_global $ptr<workspace>))
        (set_local $ptr<extra> (get_global $ptr<workspace>))
        (set_local $match (i32.const 20))
        br $break
      end $LENS:
        (set_local $ptr<base> (get_global $ptr<lengthCodes257_285Base>))
        (set_local $ptr<extra> (get_global $ptr<lengthCodes257_285Extra>))
        (set_local $match (i32.const 257))
        br $break
      end $DISTS:
        (set_local $ptr<base> (get_global $ptr<distanceCodes0_29Base>))
        (set_local $ptr<extra> (get_global $ptr<distanceCodes0_29Extra>))
        (set_local $match (i32.const 0))
        br $break
    end $break
    
    (set_local $huff (i32.const 0)) ;; starting code
    (set_local $sym (i32.const 0)) ;; starting code symbol
    (set_local $len (get_local $min)) ;; starting code length
    (set_local $ptr<next> (get_local $ptr<table>)) ;; current table to fill in
    (set_local $curr (get_local $root)) ;; current table index bits
    (set_local $drop (i32.const 0)) ;; current bits to drop from code for index
    (set_local $low (i32.const 0xffffffff)) ;; trigger new sub-table when len > root
    (set_local $used (i32.shl (i32.const 1) (get_local $root))) ;; use root table entries
    (set_local $mask (i32.sub (get_local $used) (i32.const 1))) ;; mask for comparing low
    
    (if (i32.or
      (i32.and (i32.eq (get_local $mode) (get_global $LENS )) (i32.gt_u (get_local $used) (get_global $ENOUGH_LENS )))
      (i32.and (i32.eq (get_local $mode) (get_global $DISTS)) (i32.gt_u (get_local $used) (get_global $ENOUGH_DISTS)))
    ) (then
      unreachable
    ))
    
    ;; process all codes and make table entries
    block $break
      loop
        ;; create table entry
        (set_local $here_bits (i32.and (i32.const 0xff) (i32.sub (get_local $len) (get_local $drop))))
        
        (set_local $work (call $getWork (get_local $sym)))
        (if (i32.lt_u (i32.add (get_local $work) (i32.const 1)) (get_local $match)) (then
          (set_local $here_op (i32.const 0))
          (set_local $here_val (get_local $work))
        )
        (else
          (if (i32.ge_u (get_local $work) (get_local $match)) (then
            (set_local $work (i32.sub (get_local $work) (get_local $match)))
            (set_local $here_op (i32.load16_u (i32.add
              (get_local $ptr<extra>)
              (i32.mul (get_local $work) (i32.const 2))
            )))
            (set_local $here_val (i32.load16_u (i32.add
              (get_local $ptr<base>)
              (i32.mul (get_local $work) (i32.const 2))
            )))
          )
          (else
            (set_local $here_op (i32.const 96)) ;; end of block
            (set_local $here_val (i32.const 0))
          ))
        ))

        ;; replicate for those indices with low len bits equal to huff
        (set_local $incr (i32.shl (i32.const 1) (i32.sub (get_local $len) (get_local $drop))))
        (set_local $fill (i32.shl (i32.const 1) (get_local $curr)))
        (set_local $min (get_local $fill)) ;; save offset to next table
        loop
          (set_local $fill (i32.sub (get_local $fill) (get_local $incr)))
          (call $write_code
            (i32.add
              (get_local $ptr<next>)
              (i32.mul
                (i32.add
                  (i32.shr_u (get_local $huff) (get_local $drop))
                  (get_local $fill)
                )
                (i32.const 4)
              )
            )
            (get_local $here_op)
            (get_local $here_bits)
            (get_local $here_val)
          )
          drop
          (br_if 0 (get_local $fill))
        end

        ;; backwards increment the len-bit code huff
        (set_local $incr (i32.shl (i32.const 1) (i32.sub (get_local $len) (i32.const 1))))
        block
          loop
            (br_if 1 (i32.eqz (i32.and (get_local $huff) (get_local $incr))))
            (set_local $incr (i32.shr_u (get_local $incr) (i32.const 1)))
            br 0
          end
        end
        (if (get_local $incr) (then
          (set_local $huff (i32.and (get_local $huff) (i32.sub (get_local $incr) (i32.const 1))))
          (set_local $huff (i32.add (get_local $huff) (get_local $incr)))
        )
        (else
          (set_local $huff (i32.const 0))
        ))

        ;; go to next symbol, update count, len
        (set_local $sym (i32.add (get_local $sym) (i32.const 1)))
        (if (i32.eqz (call $dec_codeOfLength (get_local $len))) (then
          (br_if $break (i32.eq (get_local $len) (get_local $max)))
          (set_local $len (i32.load16_u (i32.add
            (get_local $ptr<lens>)
            (i32.mul (call $getWork (get_local $sym)) (i32.const 2))
          )))
        ))
        
        ;; create new sub-table if needed
        (if (i32.gt_u (get_local $len) (get_local $root)) (then
          (br_if 0 (i32.ne (i32.and (get_local $huff) (get_local $mask)) (get_local $low)))
          ;; if first time, transition to sub-tables
          (set_local $drop (select (get_local $drop) (get_local $root) (get_local $drop)))
          ;; increment past last table
          (set_local $ptr<next> (i32.add
            (get_local $ptr<next>)
            (i32.mul (i32.const 4) (get_local $min)) ;; here $min is 1 << $curr
          )) 
          
          ;; determine length of next table
          (set_local $curr (i32.sub (get_local $len) (get_local $drop)))
          (set_local $left (i32.shl (i32.const 1) (get_local $curr)))
          block
            loop
              (br_if 1 (i32.ge_u (i32.add (get_local $curr) (get_local $drop)) (get_local $max)))
              (set_local $left (i32.sub
                (get_local $left)
                (call $getCodeOfLength (i32.add (get_local $curr) (get_local $drop)))
              ))
              (br_if 1 (i32.le_s (get_local $left) (i32.const 0)))
              (set_local $curr (i32.add (get_local $curr) (i32.const 1)))
              (set_local $left (i32.shl (get_local $left) (i32.const 1)))
              br 0
            end
          end
          ;; check for enough space
          (set_local $used (i32.add
            (get_local $used)
            (i32.shl (i32.const 1) (get_local $curr))
          ))
          
          (if (i32.or
            (i32.and (i32.eq (get_local $mode) (get_global $LENS )) (i32.gt_u (get_local $used) (get_global $ENOUGH_LENS )))
            (i32.and (i32.eq (get_local $mode) (get_global $DISTS)) (i32.gt_u (get_local $used) (get_global $ENOUGH_DISTS)))
          ) (then
            unreachable
          ))
          
          ;; point entry in root table to sub-table
          (set_local $low (i32.and (get_local $huff) (get_local $mask)))
          (i32.store
            (i32.add (get_local $ptr<table>) (i32.mul (get_local $low) (i32.const 4)))
            (call $code
              (get_local $curr)
              (get_local $root)
              (i32.div_u
                (i32.sub
                  (get_local $ptr<next>)
                  (get_local $ptr<table>)
                )
                (i32.const 2)
              )
            )
          )
        ))
        br 0
      end
    end $break
    
    (if (get_local $huff) (then
      ;; fill in remaining table entry if code is incomplete (guaranteed to have
      ;; at most one remaining entry, since if the code is incomplete, the
      ;; maximum code length that was allowed to get this far is one bit)
      (call $write_code
        (i32.add (get_local $ptr<next>) (i32.const 4))
        (i32.const 64) ;; invalid code marker
        (i32.sub (get_local $len) (get_local $drop))
        (i32.const 0)
      )
      drop
    ))
    
    (set_global $ptr<lastTableEnd> (i32.add (get_local $ptr<table>) (i32.mul (get_local $used) (i32.const 4))))
    (set_global $lastTableBits (get_local $root))
  )
  
  (func (export "ptr_lengthCodes257_285Base") (result i32) (return (get_global $ptr<lengthCodes257_285Base>)))
  (func (export "sizeof_lengthCodes257_285Base") (result i32) (return (get_global $sizeof<lengthCodes257_285Base>)))
  
  (func (export "ptr_lengthCodes257_285Extra") (result i32) (return (get_global $ptr<lengthCodes257_285Extra>)))
  (func (export "sizeof_lengthCodes257_285Extra") (result i32) (return (get_global $sizeof<lengthCodes257_285Extra>)))
  
  (func (export "ptr_distanceCodes0_29Base") (result i32) (return (get_global $ptr<distanceCodes0_29Base>)))
  (func (export "sizeof_distanceCodes0_29Base") (result i32) (return (get_global $sizeof<distanceCodes0_29Base>)))
  
  (func (export "ptr_distanceCodes0_29Extra") (result i32) (return (get_global $ptr<distanceCodes0_29Extra>)))
  (func (export "sizeof_distanceCodes0_29Extra") (result i32) (return (get_global $sizeof<distanceCodes0_29Extra>)))
  
  (func (export "ptr_codesOfLength") (result i32) (return (get_global $ptr<codesOfLength>)))
  (func (export "sizeof_codesOfLength") (result i32) (return (get_global $sizeof<codesOfLength>)))
  
  (func (export "ptr_literalLengthLens") (result i32) (return (get_global $ptr<literalLengthLens>)))
  (func (export "sizeof_literalLengthLens") (result i32) (return (get_global $sizeof<literalLengthLens>)))
  
  (func (export "ptr_distanceLens") (result i32) (return (get_global $ptr<distanceLens>)))
  (func (export "sizeof_distanceLens") (result i32) (return (get_global $sizeof<distanceLens>)))
  
  (func (export "ptr_codeLens") (result i32) (return (get_global $ptr<codeLens>)))
  (func (export "sizeof_codeLens") (result i32) (return (get_global $sizeof<codeLens>)))
  
  (func (export "ptr_workspace") (result i32) (return (get_global $ptr<workspace>)))
  (func (export "sizeof_workspace") (result i32) (return (get_global $sizeof<workspace>)))
  
  (func (export "ptr_lengthTableOffsets") (result i32) (return (get_global $ptr<lengthTableOffsets>)))
  (func (export "sizeof_lengthTableOffsets") (result i32) (return (get_global $sizeof<lengthTableOffsets>)))

  (start $init)

)
