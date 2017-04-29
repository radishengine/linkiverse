(module

  (import "memory" "main" (memory 0))

  (func (export "adler32") (param $adler i32) (param $in i32) (param $len i32)
    (param $sum2 i32)
    (param $n i32)
    
    (set_local $sum2 (i32.shr_u (get_local $adler) (i32.const 16)))
    (set_local $adler (i32.and (get_local $adler) (i32.const 0xffff)))
    
    (if (i32.eq (get_local $len) (i32.const 1)) (then
      (set_local $adler (i32.add (get_local $adler) (i32.load8_u (get_local $in))))
      (if (i32.ge_u (get_local $adler) (i32.const 65521)) (then
        (set_local $adler (i32.sub (get_local $adler) (i32.const 65521)))
      ))
      (set_local $sum2 (i32.add (get_local $sum2) (get_local $adler)))
      (if (i32.ge_u (get_local $sum2) (i32.const 65521)) (then
        (set_local $adler (i32.sub (get_local $sum2) (i32.const 65521)))
      ))
      (return (i32.or (get_local $adler) (i32.shl (get_local $sum2) (i32.const 16))))
    ))
    
    (if (i32.lt_u (get_local $len) (i32.const 16)) (then
      (if (get_local $len) (then
        loop $top
          ;; sum2 += (adler += *buf++);
          get_local $sum2
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u (get_local $in))))
          i32.add
          set_local $sum2
          (set_local $in (i32.add (get_local $in) (i32.const 1)))
          (br_if $top (tee_local $len (i32.sub (get_local $len) (i32.const 1))))
        end
      ))
      (if (i32.ge_u (get_local $adler) (i32.const 65521)) (then
        (set_local $adler (i32.sub (get_local $adler) (i32.const 65521)))
      ))
      (set_local $sum2 (i32.rem_u (get_local $sum2) (i32.const 65521)))
      (return (i32.or (get_local $adler) (i32.shl (get_local $sum2) (i32.const 16))))      
    ))
    
    block $break
      loop $top
        (br_if $break (i32.lt_u (get_local $len) (i32.const 5552)))
        (set_local $len (i32.sub (get_local $len) (i32.const 5552)))
        (set_local $n (i32.const 347)) ;; 347 = 5552 / 16
        loop $top2
          ;; un-rollin'-rollin'-rollin'
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=0 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=1 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=2 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=3 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=4 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=5 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=6 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=7 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=8 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=9 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=10 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=11 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=12 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=13 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=14 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=15 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (set_local $in (i32.add (get_local $in) (i32.const 16)))
          (br_if $top2 (tee_local $n (i32.sub (get_local $n) (i32.const 1))))
        end
        (set_local $adler (i32.rem_u (get_local $adler) (i32.const 65521)))
        (set_local $sum2 (i32.rem_u (get_local $sum2) (i32.const 65521)))
        br $top
      end
    end $break
    
    (if (get_local $len) (then
      block $break
        loop $top
          (br_if $break (i32.lt_u (get_local $len) (i32.const 16)))
          (set_local $len (i32.sub (get_local $len) (i32.const 16)))
          ;; un-rollin'-rollin'-rollin'
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=0 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=1 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=2 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=3 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=4 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=5 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=6 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=7 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=8 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=9 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=10 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=11 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=12 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=13 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=14 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (tee_local $adler (i32.add (get_local $adler) (i32.load8_u offset=15 (get_local $in))))
            (get_local $sum2) (i32.add) (set_local $sum2)
          (set_local $in (i32.add (get_local $in) (i32.const 16)))
        end
        ;; same as an earlier loop, for the $len<16 case
        (if (get_local $len) (then
          loop $top
            ;; sum2 += (adler += *buf++);
            get_local $sum2
            (tee_local $adler (i32.add (get_local $adler) (i32.load8_u (get_local $in))))
            i32.add
            set_local $sum2
            (set_local $in (i32.add (get_local $in) (i32.const 1)))
            (br_if $top (tee_local $len (i32.sub (get_local $len) (i32.const 1))))
          end
        ))
        (set_local $adler (i32.rem_u (get_local $adler) (i32.const 65521)))
        (set_local $sum2 (i32.rem_u (get_local $sum2) (i32.const 65521)))        
      end $break
    ))
    
    (return (i32.or (get_local $adler) (i32.shl (get_local $sum2) (i32.const 16))))      
  )
  
  (global (export "initialAdler32") i32 i32.const 1)
  
)
