(module

  (import "memory" "main" (memory 0))

  (func (export "swap32") (param $ptr<buf> i32) (param $end<buf> i32)
    (local $v i32)
    block
      loop
        (br_if 1 (i32.ge_u (get_local $ptr<buf>) (get_local $end<buf>)))
        (set_local $v (i32.load (get_local $ptr<buf>)))
        (i32.store (get_local $ptr<buf>) (i32.or
          (i32.or
            (i32.shr_u (get_local $v) (i32.const 24))
            (i32.shl   (get_local $v) (i32.const 24))
          )
          (i32.or
            (i32.and (i32.shr_u (get_local $v) (i32.const 8)) (i32.const 0x00ff00))
            (i32.and (i32.shl   (get_local $v) (i32.const 8)) (i32.const 0xff0000))
          )
        ))
        (set_local $ptr<buf> (i32.add (get_local $end<buf>) (i32.const 4)))
        br 0
      end
    end
  )

  (func $ensureOut (param $ptr<out> i32) (param $n_samples i32)
    (local $pageDiff i32)
    block
      (set_local $pageDiff (i32.sub
        (i32.shr_u
          (i32.add
            (get_local $ptr<out>)
            (i32.mul (get_local $n_samples) (i32.const 4))
          )
          (i32.const 16)
        )
        (current_memory)
      ))
      (br_if 0 (i32.gt_s (get_local $pageDiff) (i32.const 0)))
      (drop (grow_memory (get_local $pageDiff)))
    end
  )

  (func $sample_i8_u (param i32) (result f32)
    (f32.div
      (f32.convert_s/i32 (i32.sub
        (get_local 0)
        (i32.const 128)
      ))
      (f32.const 128)
    )
  )

  (func $sample_i8_s (param i32) (result f32)
    (f32.div
      (f32.convert_s/i32 (get_local 0))
      (f32.const 128)
    )
  )

  (func (export "samples_i8_u") (param $ptr<i8_u> i32) (param $end<i8_u> i32) (param $ptr<out> i32)
    (local $end<align4> i32)
    (local $block32 i32)

    (call $ensureOut (get_local $ptr<out>) (i32.sub (get_local $end<i8_u>) (get_local $ptr<i8_u>)))

    block $done

      (if (i32.and (get_local $ptr<i8_u>) (i32.const 3)) (then
        loop
          (br_if $done (i32.ge_u (get_local $ptr<i8_u>) (get_local $end<i8_u>)))
          (f32.store (get_local $ptr<out>) (call $sample_i8_u (i32.load8_u (get_local $ptr<i8_u>))))
          (set_local $ptr<out> (i32.add (get_local $ptr<out>) (i32.const 4)))
          (br_if 0 (i32.and
            (tee_local $ptr<i8_u> (i32.add (get_local $ptr<i8_u>) (i32.const 1)))
            (i32.const 3)
          ))
        end
      ))

      (set_local $end<align4> (i32.and (get_local $end<i8_u>) (i32.const -4)))

      (if (i32.lt_u (get_local $ptr<i8_u>) (get_local $end<align4>)) (then
        loop
          (br_if $done (i32.ge_u (get_local $ptr<i8_u>) (get_local $end<i8_u>)))
          (set_local $block32 (i32.load (get_local $ptr<i8_u>)))
          (f32.store offset=0 (get_local $ptr<out>)
            (call $sample_i8_u (i32.and            (get_local $block32)                 (i32.const 255)))
          )
          (f32.store offset=4 (get_local $ptr<out>)
            (call $sample_i8_u (i32.and (i32.shr_u (get_local $block32) (i32.const  8)) (i32.const 255)))
          )
          (f32.store offset=8 (get_local $ptr<out>)
            (call $sample_i8_u (i32.and (i32.shr_u (get_local $block32) (i32.const 16)) (i32.const 255)))
          )
          (f32.store offset=12 (get_local $ptr<out>)
            (call $sample_i8_u          (i32.shr_u (get_local $block32) (i32.const 24))                 )
          )
          (set_local $ptr<out> (i32.add (get_local $ptr<out>) (i32.const 16)))
          (br_if 0 (i32.lt_u
            (tee_local $ptr<i8_u> (i32.add (get_local $ptr<i8_u>) (i32.const 4)))
            (get_local $end<align4>)
          ))
        end
      ))

      loop
        (br_if $done (i32.ge_u (get_local $ptr<i8_u>) (get_local $end<i8_u>)))
        (f32.store (get_local $ptr<out>) (call $sample_i8_u (i32.load8_u (get_local $ptr<i8_u>))))
        (set_local $ptr<out> (i32.add (get_local $ptr<out>) (i32.const 4)))
        (set_local $ptr<i8_u> (i32.add (get_local $ptr<i8_u>) (i32.const 1)))
        br 0
      end
      unreachable

    end $done
  )

)
